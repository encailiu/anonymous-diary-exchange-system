var SHEET_DEFINITIONS = {
  Participants: ['participant_id', 'email', 'active', 'created_at'],
  Diaries: ['diary_id', 'diary_date', 'submitted_at', 'participant_id', 'email', 'body', 'status', 'comment_token'],
  Matches: ['match_id', 'diary_date', 'match_type', 'left_diary_id', 'right_diary_id', 'left_participant_id', 'right_participant_id', 'status', 'created_at'],
  DeliveryLog: ['delivery_id', 'diary_date', 'diary_id', 'recipient_participant_id', 'recipient_email', 'status', 'attempted_at', 'delivered_at', 'error'],
  RunLog: ['run_id', 'diary_date', 'status', 'details', 'created_at'],
  Comments: ['comment_id', 'comment_token', 'diary_date', 'body', 'status', 'submitted_at', 'notified_at', 'error']
};

function initializeSpreadsheet() {
  var spreadsheet = getSpreadsheet_();
  Object.keys(SHEET_DEFINITIONS).forEach(function(name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(SHEET_DEFINITIONS[name]);
    else migrateAndValidateSheetHeaders_(sheet, name);
  });
}

function migrateAndValidateSheetHeaders_(sheet, name) {
  var expected = SHEET_DEFINITIONS[name];
  var actualLength = sheet.getLastColumn();
  var actual = sheet.getRange(1, 1, 1, actualLength).getValues()[0];
  actual.forEach(function(header, index) {
    if (expected[index] !== header) throw new Error('Unexpected headers in sheet: ' + name + '.');
  });
  if (actualLength > expected.length) throw new Error('Unexpected headers in sheet: ' + name + '.');
  if (actualLength < expected.length) {
    sheet.getRange(1, actualLength + 1, 1, expected.length - actualLength).setValues([expected.slice(actualLength)]);
  }
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name + '. Run initializeSpreadsheet first.');
  return sheet;
}

function getRows_(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).map(function(row, index) {
    var record = { _rowNumber: index + 2 };
    headers.forEach(function(header, column) { record[header] = row[column]; });
    return record;
  });
}

function appendRecord_(sheetName, record) {
  var headers = SHEET_DEFINITIONS[sheetName];
  if (!headers) throw new Error('Unknown sheet: ' + sheetName);
  getSheet_(sheetName).appendRow(headers.map(function(header) { return record[header] || ''; }));
}

function appendRecords_(sheetName, records) {
  if (records.length === 0) return;
  var headers = SHEET_DEFINITIONS[sheetName];
  if (!headers) throw new Error('Unknown sheet: ' + sheetName);
  var sheet = getSheet_(sheetName);
  var values = records.map(function(record) {
    return headers.map(function(header) { return record[header] || ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function updateRecord_(sheetName, rowNumber, record) {
  var headers = SHEET_DEFINITIONS[sheetName];
  var sheet = getSheet_(sheetName);
  headers.forEach(function(header, column) {
    if (Object.prototype.hasOwnProperty.call(record, header)) sheet.getRange(rowNumber, column + 1).setValue(record[header]);
  });
}
