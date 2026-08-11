function onDiaryFormSubmit(event) {
  return withScriptLock_(function() {
    try {
      var response = event && event.response;
      if (!response) throw new Error('Form response event is required.');
      var config = getConfig_();
      var submittedAt = response.getTimestamp();
      var email = normalizeEmail_(response.getRespondentEmail());
      var body = getDiaryBody_(response, config.diaryBodyItemTitle);
      if (!email) throw new Error('The form must collect respondent email addresses.');
      if (!body) throw new Error('Diary body is empty.');
      var diaryDate = getDiaryDateForSubmission_(submittedAt);
      var participant = getActiveParticipantsByEmail_()[email];
      var status = participant ? 'accepted' : 'rejected';
      if (participant && hasAcceptedDiary_(participant.participantId, diaryDate)) status = 'rejected_duplicate';
      appendRecord_('Diaries', {
        diary_id: createId_(), diary_date: diaryDate, submitted_at: formatJst_(submittedAt, 'yyyy-MM-dd HH:mm:ss'),
        participant_id: participant ? participant.participantId : '', email: status === 'accepted' ? email : '',
        body: status === 'accepted' ? body : '', status: status,
        comment_token: status === 'accepted' ? createUniqueCommentToken_() : ''
      });
      return status;
    } catch (error) {
      notifyAdminsOfError('onDiaryFormSubmit', error);
      throw error;
    }
  });
}

function ensureDiaryCommentToken_(diary) {
  if (/^[a-f0-9]{64}$/i.test(String(diary.comment_token || ''))) return diary.comment_token;
  if (!diary._rowNumber || String(diary.status) !== 'accepted') throw new Error('Accepted diary is missing a valid comment token.');
  var token = createUniqueCommentToken_();
  updateRecord_('Diaries', diary._rowNumber, { comment_token: token });
  diary.comment_token = token;
  return token;
}

function getDiaryBody_(response, itemTitle) {
  var itemResponses = response.getItemResponses();
  for (var index = 0; index < itemResponses.length; index += 1) {
    if (itemResponses[index].getItem().getTitle() === itemTitle) return String(itemResponses[index].getResponse() || '').trim();
  }
  throw new Error('Diary body item was not found: ' + itemTitle);
}

function hasAcceptedDiary_(participantId, diaryDate) {
  return getRows_('Diaries').some(function(row) {
    return String(row.participant_id) === participantId && String(row.diary_date) === diaryDate && String(row.status) === 'accepted';
  });
}

function getAcceptedDiariesForDate_(diaryDate) {
  return getRows_('Diaries').filter(function(row) {
    return String(row.diary_date) === diaryDate && String(row.status) === 'accepted';
  });
}

function getEligibleDiariesForDate_(diaryDate) {
  var activeParticipants = getParticipantsById_();
  return getAcceptedDiariesForDate_(diaryDate).filter(function(diary) {
    return Object.prototype.hasOwnProperty.call(activeParticipants, String(diary.participant_id));
  });
}
