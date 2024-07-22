const { google } = require('googleapis');
const config = require('./config.json');

/**
 * A brief style note: I'm using the promise variant of the Google Calendar
 * API because I can't figure out how to get the callback version to play
 * nicely with async/await. I'm not super attached to this style, but it
 * works well enough for now. If I learn better ways I'll tidy it up then.
 */

module.exports = class GoogleCalendar {
  jwtClient = null;
  calendarApi = null;

  // ACL rule to make a calendar public
  aclRule = {
    scope: { type: 'default' },
    role: 'reader',
  };

  constructor() {
    if (!config.googleApiClientEmail || !config.googleApiPrivateKey) {
      throw new Error('This instance of AginahBot is not configured to support Google Calendar integration.');
    }

    this.jwtClient = new google.auth.JWT(
      config.googleApiClientEmail,
      null,
      config.googleApiPrivateKey,
      ['https://www.googleapis.com/auth/calendar'],
      null,
    );

    this.calendarApi = google.calendar({ version: 'v3', auth: this.jwtClient });
  }

  /**
   * Produces a formatted URL for a calendar
   * @param {String} id
   * @returns {String}
   */
  static createUrlFromCalendarId(id) {
    return `https://calendar.google.com/calendar/embed?src=${id.replace('@', '%40')}`;
  }

  /**
   * Create a new Google Calendar
   * @param {String} name
   * @returns {Promise<String>}
   */
  createCalendar = async (name) => {
    // Create the calendar
    const response = await this.calendarApi.calendars.insert({
      auth: this.jwtClient,
      resource: { 'summary': name }
    });

    const calendarId = response.data.id;

    // Use the calendar ID to make the calendar public
    await this.calendarApi.acl.insert({
      auth: this.jwtClient,
      calendarId: calendarId,
      resource: this.aclRule,
    });

    return calendarId;
  };

  /**
   * Delete a Google Calendar
   * @param {String} id
   * @returns {Promise<void>}
   */
  deleteCalendar = async (id) => {
    await this.calendarApi.calendars.delete({
      auth: this.jwtClient,
      calendarId: id
    });
  };

  /**
   * Add en event to a calendar
   * @param {String} calendarId
   * @param {Date} eventDate
   * @param {String} host
   * @param {String} eventTitle
   * @param {String} role
   * @param {Number} duration Duration of the event in hours
   * @returns {Promise<String>}
   */
  createEvent = async (calendarId, eventDate, host, eventTitle, role=null, duration=2) => {
    const event = await this.calendarApi.events.insert({
      calendarId: calendarId,
      resource: {
        summary: eventTitle,
        location: `${role ? `Type: ${role.name}\n` : ''}`,
        description: `Host: ${host}`,
        start: {
          dateTime: eventDate.toISOString(),
        },
        end: {
          dateTime: new Date(eventDate.getTime() + (duration * 60 * 60 * 1000)).toISOString(),
        }
      },
    });

    return event.data.id;
  };

  /**
   * Reschedule an event
   * @param {String} calendarId
   * @param {String} eventId
   * @param {Date} eventDate
   * @param {Number} duration Duration of the event in hours
   * @returns {Promise<void>}
   */
  rescheduleEvent = async (calendarId, eventId, eventDate, duration=2) => {
    await this.calendarApi.events.patch({
      calendarId: calendarId,
      eventId: eventId,
      resource: {
        start: {
          dateTime: eventDate.toISOString(),
        },
        end: {
          dateTime: new Date(eventDate.getTime() + (duration * 60 * 60 * 1000)).toISOString(),
        },
      },
    });
  };

  /**
   * Cancel an event
   * @param {String} calendarId
   * @param {String} eventId
   * @returns {Promise<void>}
   */
  cancelEvent = async (calendarId, eventId) => {
    await this.calendarApi.events.delete({
      calendarId: calendarId,
      eventId: eventId
    });
  };

  /**
   * Get an array of objects representing all calendars
   * @returns {Promise<calendar_v3.Schema$CalendarListEntry[]>}
   */
  getCalendars = async () => {
    const response = await this.calendarApi.calendarList.list({
      auth: this.jwtClient
    });
    return response.data.items;
  };

  /**
   * Get an array of objects representing all events for a specified calendar
   * @param {String} calendarId
   * @returns {Promise<Array>}
   */
  getCalendarEvents = async (calendarId) => {
    const response = await this.calendarApi.events.list({
      auth: this.jwtClient,
      calendarId: calendarId
    });
    return response.data.items;
  };
};
