var CONFIG_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ADMIN_EMAILS: 'ADMIN_EMAILS',
  TIMEZONE: 'TIMEZONE',
  MAIL_PROVIDER: 'MAIL_PROVIDER',
  DIARY_BODY_ITEM_TITLE: 'DIARY_BODY_ITEM_TITLE',
  FORM_ID: 'FORM_ID'
};

function getConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty(CONFIG_KEYS.SPREADSHEET_ID);
  var adminEmails = parseEmailList_(properties.getProperty(CONFIG_KEYS.ADMIN_EMAILS));
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not configured.');
  if (adminEmails.length === 0) throw new Error('ADMIN_EMAILS is not configured.');
  return {
    spreadsheetId: spreadsheetId,
    adminEmails: adminEmails,
    timezone: properties.getProperty(CONFIG_KEYS.TIMEZONE) || 'Asia/Tokyo',
    mailProvider: properties.getProperty(CONFIG_KEYS.MAIL_PROVIDER) || 'gmail',
    diaryBodyItemTitle: properties.getProperty(CONFIG_KEYS.DIARY_BODY_ITEM_TITLE) || '日記本文',
    formId: properties.getProperty(CONFIG_KEYS.FORM_ID) || ''
  };
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getConfig_().spreadsheetId);
}

function parseEmailList_(value) {
  if (!value) return [];
  return value.split(',').map(normalizeEmail_).filter(function(email) { return email !== ''; });
}
