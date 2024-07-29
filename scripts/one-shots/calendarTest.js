const GoogleCalendar = require('../../GoogleCalendar');

(async () => {
  const calendar = new GoogleCalendar();
  await calendar.createCalendar('Foo');
})();
