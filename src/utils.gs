function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function formatJst_(date, pattern) {
  return Utilities.formatDate(date, 'Asia/Tokyo', pattern);
}

function getDiaryDateForSubmission_(submittedAt) {
  var date = new Date(submittedAt.getTime());
  var time = formatJst_(date, 'HHmmss');
  if (time >= '220000') date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return formatJst_(date, 'yyyy-MM-dd');
}

function getExchangeTargetDate_(now) {
  var date = new Date(now.getTime());
  if (formatJst_(date, 'HHmmss') < '220000') date = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return formatJst_(date, 'yyyy-MM-dd');
}

function addDaysToDateKey_(dateKey, days) {
  var parts = dateKey.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days, 12, 0, 0));
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function isValidDateKey_(dateKey) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) return false;
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another exchange operation is already running.');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function createId_() {
  return Utilities.getUuid();
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assert_(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed.');
}
