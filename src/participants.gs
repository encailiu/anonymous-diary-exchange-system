function getActiveParticipantsByEmail_() {
  var participants = {};
  getRows_('Participants').forEach(function(row) {
    var email = normalizeEmail_(row.email);
    if (email && String(row.active).toLowerCase() === 'true') {
      participants[email] = { participantId: String(row.participant_id), email: email };
    }
  });
  return participants;
}

function getParticipantsById_() {
  var participants = {};
  getRows_('Participants').forEach(function(row) {
    var id = String(row.participant_id);
    var email = normalizeEmail_(row.email);
    if (id && email && String(row.active).toLowerCase() === 'true') participants[id] = { participantId: id, email: email };
  });
  return participants;
}

function addParticipantFromPrompt() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt('参加者を追加', '参加者のGoogleアカウントのメールアドレスを入力してください。', ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;
    var email = normalizeEmail_(response.getResponseText());
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      ui.alert('メールアドレスの形式が正しくありません。');
      return;
    }
    var exists = getRows_('Participants').some(function(row) { return normalizeEmail_(row.email) === email; });
    if (exists) {
      ui.alert('このメールアドレスはすでに登録されています。');
      return;
    }
    appendRecord_('Participants', {
      participant_id: createId_(), email: email, active: 'true', created_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss')
    });
    ui.alert('参加者を追加しました。');
  } catch (error) {
    notifyAdminsOfError('addParticipant', error);
    throw error;
  }
}
