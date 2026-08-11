function pairKey_(firstParticipantId, secondParticipantId) {
  return [String(firstParticipantId), String(secondParticipantId)].sort().join(':');
}

function createMatches_(diaries, recentPairKeys, skipCounts, lastSkippedParticipantId, random) {
  var randomFn = random || Math.random;
  var remaining = diaries.slice();
  var skipped = null;
  if (remaining.length % 2 === 1) {
    skipped = selectSkippedDiary_(remaining, skipCounts, lastSkippedParticipantId, randomFn);
    remaining = remaining.filter(function(diary) { return diary.participant_id !== skipped.participant_id; });
  }
  shuffle_(remaining, randomFn);
  var pairs = [];
  while (remaining.length > 0) {
    var first = remaining.shift();
    var candidateIndex = remaining.findIndex(function(candidate) {
      return !recentPairKeys[pairKey_(first.participant_id, candidate.participant_id)];
    });
    if (candidateIndex < 0) candidateIndex = 0;
    pairs.push([first, remaining.splice(candidateIndex, 1)[0]]);
  }
  return { pairs: pairs, skipped: skipped };
}

function selectSkippedDiary_(diaries, skipCounts, lastSkippedParticipantId, random) {
  var candidates = diaries.filter(function(diary) { return diary.participant_id !== lastSkippedParticipantId; });
  if (candidates.length === 0) candidates = diaries.slice();
  var lowestCount = Math.min.apply(null, candidates.map(function(diary) { return Number(skipCounts[diary.participant_id] || 0); }));
  var leastSkipped = candidates.filter(function(diary) { return Number(skipCounts[diary.participant_id] || 0) === lowestCount; });
  return leastSkipped[Math.floor(random() * leastSkipped.length)];
}

function shuffle_(items, random) {
  for (var index = items.length - 1; index > 0; index -= 1) {
    var swapIndex = Math.floor(random() * (index + 1));
    var temp = items[index]; items[index] = items[swapIndex]; items[swapIndex] = temp;
  }
}
