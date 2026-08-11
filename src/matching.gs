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
  var pairs = findPairingAvoidingRecent_(remaining, recentPairKeys, randomFn);
  return { pairs: pairs, skipped: skipped };
}

function findPairingAvoidingRecent_(diaries, recentPairKeys, random) {
  var best = null;
  var bestRecentCount = Infinity;
  var visited = 0;
  var maxVisited = 20000;
  var shuffled = diaries.slice();
  shuffle_(shuffled, random);

  function search(remaining, pairs, recentCount) {
    visited += 1;
    if (visited > maxVisited || recentCount >= bestRecentCount) return;
    if (remaining.length === 0) {
      best = pairs.slice();
      bestRecentCount = recentCount;
      return;
    }
    var first = remaining[0];
    var candidates = remaining.slice(1).map(function(candidate, index) {
      return {
        candidate: candidate,
        index: index + 1,
        recent: recentPairKeys[pairKey_(first.participant_id, candidate.participant_id)] ? 1 : 0
      };
    });
    candidates.sort(function(left, right) { return left.recent - right.recent; });
    for (var index = 0; index < candidates.length; index += 1) {
      var choice = candidates[index];
      var next = remaining.slice(1);
      next.splice(choice.index - 1, 1);
      search(next, pairs.concat([[first, choice.candidate]]), recentCount + choice.recent);
      if (bestRecentCount === 0) return;
    }
  }

  search(shuffled, [], 0);
  if (best) return best;
  var fallback = [];
  while (shuffled.length > 0) fallback.push([shuffled.shift(), shuffled.shift()]);
  return fallback;
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
