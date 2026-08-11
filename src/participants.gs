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
