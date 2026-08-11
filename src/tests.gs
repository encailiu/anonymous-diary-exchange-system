function runMvpSelfTests() {
  testDeadlineBoundary_();
  testMatchingNoSelfOrDuplicate_();
  testRecentPairAvoidance_();
  testRecentPairGlobalAvoidance_();
  testOddSkipFairness_();
  testIncompleteMatchesRejected_();
  testZeroAndOneSubmission_();
  testHtmlEscaping_();
  testDateValidation_();
  testCommentToken_();
  return 'MVP self-tests passed.';
}

function testCommentToken_() {
  assert_(/^[a-f0-9]{64}$/i.test(createCommentToken_()), 'Comment token must contain 64 random hexadecimal characters.');
}

function testIncompleteMatchesRejected_() {
  var diaries = sampleDiaries_(['a', 'b', 'c', 'd']);
  var matches = [{ match_type: 'pair', left_diary_id: 'diary-a', right_diary_id: 'diary-b' }];
  var rejected = false;
  try { validateMatchesForDiaries_(matches, diaries); } catch (error) { rejected = true; }
  assert_(rejected, 'Incomplete existing matches must stop the run.');
}

function testRecentPairGlobalAvoidance_() {
  var diaries = sampleDiaries_(['a', 'b', 'c', 'd']);
  var recent = {};
  [pairKey_('a', 'b'), pairKey_('a', 'd'), pairKey_('b', 'c'), pairKey_('c', 'd')].forEach(function(key) { recent[key] = true; });
  var result = createMatches_(diaries, recent, {}, '', function() { return 0; });
  assert_(result.pairs.every(function(pair) {
    return !recent[pairKey_(pair[0].participant_id, pair[1].participant_id)];
  }), 'Recent pairs must be avoided when a complete alternative exists.');
}

function testDeadlineBoundary_() {
  assert_(getDiaryDateForSubmission_(new Date('2026-01-02T12:59:59Z')) === '2026-01-02', '21:59:59 JST must be same-day.');
  assert_(getDiaryDateForSubmission_(new Date('2026-01-02T13:00:00Z')) === '2026-01-03', '22:00:00 JST must be next-day.');
}

function testMatchingNoSelfOrDuplicate_() {
  var diaries = sampleDiaries_(['a', 'b', 'c', 'd']);
  var result = createMatches_(diaries, {}, {}, '', function() { return 0; });
  assert_(result.pairs.length === 2, 'Four diaries must create two pairs.');
  var participants = {};
  result.pairs.forEach(function(pair) {
    assert_(pair[0].participant_id !== pair[1].participant_id, 'Self match is forbidden.');
    pair.forEach(function(diary) { assert_(!participants[diary.participant_id], 'Participant must appear once.'); participants[diary.participant_id] = true; });
  });
}

function testRecentPairAvoidance_() {
  var diaries = sampleDiaries_(['a', 'b', 'c', 'd']);
  var recent = {}; recent[pairKey_('a', 'b')] = true;
  var result = createMatches_(diaries, recent, {}, '', function() { return 0; });
  assert_(result.pairs.every(function(pair) { return pairKey_(pair[0].participant_id, pair[1].participant_id) !== pairKey_('a', 'b'); }), 'Recent pair should be avoided when possible.');
}

function testOddSkipFairness_() {
  var diaries = sampleDiaries_(['a', 'b', 'c']);
  var result = createMatches_(diaries, {}, { a: 2, b: 0, c: 0 }, 'b', function() { return 0; });
  assert_(result.skipped.participant_id !== 'a', 'Most frequently skipped participant must be rescued.');
  assert_(result.skipped.participant_id !== 'b', 'Last skipped participant must be avoided when possible.');
}

function testZeroAndOneSubmission_() {
  var noDiaryResult = createMatches_([], {}, {}, '', function() { return 0; });
  assert_(noDiaryResult.pairs.length === 0 && noDiaryResult.skipped === null, 'Zero diaries must not create matches.');
  var oneDiaryResult = createMatches_(sampleDiaries_(['a']), {}, {}, '', function() { return 0; });
  assert_(oneDiaryResult.pairs.length === 0 && oneDiaryResult.skipped.participant_id === 'a', 'One diary must be skipped.');
}

function testHtmlEscaping_() {
  assert_(escapeHtml_('<script>') === '&lt;script&gt;', 'Mail HTML must escape diary text.');
}

function testDateValidation_() {
  assert_(isValidDateKey_('2026-02-28'), 'A real date must be accepted.');
  assert_(!isValidDateKey_('2026-02-29'), 'An impossible date must be rejected.');
  assert_(!isValidDateKey_('2026-13-01'), 'An impossible month must be rejected.');
}

function sampleDiaries_(participantIds) {
  return participantIds.map(function(id) { return { diary_id: 'diary-' + id, participant_id: id, body: 'sample' }; });
}
