const { google } = require('googleapis');
const config = require('./config.json');

/**
 * A brief style note: I'm using the promise variant of the Google Calendar
 * API because I can't figure out how to get the callback version to play
 * nicely with async/await. I'm not super attached to this style, but it
 * works well enough for now. If I learn better ways I'll tidy it up then.
 */

// Some rabbit crimes. Will fix this later, if required. (Maybe it's okay though?)
Date.prototype.addHours = function(h) {
  this.setTime(this.getTime() + (h*60*60*1000));
  return this;
};

// Create a new JWT client.

/**
 * Need to wrap this in a try-catch and handle it with the following string:
 * 
 * This instance of AginahBot is not configured to support Google Calendar integration.
 * To rectify this, please have its maintainer provide the required credentials.
 * 
 * That string should probably get sent when people run createCalendar without credentials.
 */
const jwtClient = new google.auth.JWT(
  config.google_api_client_email,
  null,
  config.google_api_private_key,
  ['https://www.googleapis.com/auth/calendar'],
  null,
);

const calendarAPI = google.calendar({ version: 'v3', auth: jwtClient });

// Default ACL rule for making a calendar public (no need to redefine it each function call).
const aclRule = {
  scope: {
    type: 'default'
  },
  role: 'reader',
};

// Produces a nicely-formatted string link to a calendar, given its id.
function createLinkFromCalendarId(id) {
  return `https://calendar.google.com/calendar/embed?src=${id.replace('@', '%40')}`;
}

// Some boilerplate to handle promise errors.
function defaultCalendarError(err) {
  console.log('There was an error contacting the Calendar service: ' + err);
}

// Create a calendar and make it public.
async function createCalendar(name) {
  var calendarId;

  // Create the calendar
  await calendarAPI.calendars.insert({
    auth: jwtClient,
    resource: { 'summary': name }
  }).then((result) => {
    // console.log("Calendar created: ", result.data);

    // Extract the calendar ID
    calendarId = result.data.id;
  }, defaultCalendarError);

  // Use the calendar ID to make the calendar public
  await calendarAPI.acl.insert({
    auth: jwtClient,
    calendarId: calendarId,
    resource: aclRule
  }).then(() => {}, defaultCalendarError);

  return calendarId;
}

// Delete a calendar.
async function deleteCalendar(id) {
  if(!id) return false;

  var outcome = false;

  await calendarAPI.calendars.delete({
    auth: jwtClient,
    calendarId: id
  }).then(() => {
    outcome = true;
  }, defaultCalendarError);

  return outcome;
}

// Add an event.
async function createEvent(calendarId, name, host, role, targetDate, duration) {
  if(!calendarId) return null;

  var eventId;

  // Location string.
  const locationString = `${role ? `Type: ${role}\n` : ''}`;

  const relevantDuration = (duration) ? duration : 2;

  var event = {
    summary: name,
    location: locationString,
    description: `Host: ${host}`,
    start: {
      dateTime: targetDate.toISOString(),
    },
    end: {
      dateTime: targetDate.addHours(relevantDuration).toISOString(),
    },
  };

  await calendarAPI.events.insert({
    calendarId: calendarId,
    resource: event
  }).then((result) => {
    // console.log(result.data);
    eventId = result.data.id;
  }, defaultCalendarError);

  return eventId;
}

async function rescheduleEvent(calendarId, eventId, targetDate, duration) {
  if(!calendarId || !eventId) return false;

  var outcome = false;

  const relevantDuration = (duration) ? duration : 2;

  var event = {
    start: {
      dateTime: targetDate.toISOString(),
    },
    end: {
      dateTime: targetDate.addHours(relevantDuration).toISOString(),
    },
  };

  await calendarAPI.events.patch({
    calendarId: calendarId,
    eventId: eventId,
    resource: event
  }).then((result) => {
    // console.log(result.data);
    outcome = true;
  }, defaultCalendarError);

  return outcome;
}

// Cancel a scheduled event.
async function cancelEvent(calendarId, eventId) {
  if(!calendarId || !eventId) return false;

  var outcome = false;
  
  await calendarAPI.events.delete({
    calendarId: calendarId,
    eventId: eventId
  }).then((result) => {
    // console.log(result.data);
    outcome = true;
  }, defaultCalendarError);

  return outcome;
}

// For debugging.
async function listCalendars() {
  var idList;

  await calendarAPI.calendarList.list({
    auth: jwtClient
  }).then((result) => {
    for (const calendar of result.data.items) {
      console.log(`${calendar.summary}: ${createLinkFromCalendarId(calendar.id)}`);
    }
    idList = result.data.items.map((calendar) => calendar.id);
  }, defaultCalendarError);

  return idList;
}

// For debugging.
async function listEvents(calendarId) {
  var idList;

  await calendarAPI.events.list({
    auth: jwtClient,
    calendarId: calendarId
  }).then((result) => {
    for (const event of result.data.items) {
      console.log(event);
    }
    idList = result.data.items.map((event) => event.id);
    return idList;
  }, defaultCalendarError);

  return idList;
}

exports.createLinkFromCalendarId = createLinkFromCalendarId;
exports.createCalendar = createCalendar;
exports.deleteCalendar = deleteCalendar;
exports.createEvent = createEvent;
exports.rescheduleEvent = rescheduleEvent;
exports.cancelEvent = cancelEvent;