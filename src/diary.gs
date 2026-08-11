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
        participant_id: participant ? participant.participantId : '', email: email, body: body, status: status
      });
      return status;
    } catch (error) {
      notifyAdminsOfError('onDiaryFormSubmit', error);
      throw error;
    }
  });
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
