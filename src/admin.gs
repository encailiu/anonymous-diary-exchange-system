function installTriggers() {
  var config = getConfig_();
  if (!config.formId) throw new Error('FORM_ID is not configured.');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'onDiaryFormSubmit' || handler === 'runDailyExchange') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onDiaryFormSubmit').forForm(FormApp.openById(config.formId)).onFormSubmit().create();
  ScriptApp.newTrigger('runDailyExchange').timeBased().atHour(22).nearMinute(5).everyDays(1).create();
}
