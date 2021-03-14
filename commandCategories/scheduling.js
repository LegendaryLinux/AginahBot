const Discord = require('discord.js');
const {generalErrorHandler} = require('../errorHandlers');
const moment = require('moment-timezone');
const { dbQueryOne, dbQueryAll, dbExecute } = require('../lib');
const forbiddenWords = require('../assets/forbiddenWords.json');

// Return the offset in hours of a given timezone
const getZoneOffset = (zone) => 0 - moment.tz('1970-01-01 00:00', zone).toDate().getTime() / 1000 / 60 / 60;

const generateEventCode = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for(let i=0; i<6; ++i){
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  // Do not generate codes with offensive words
  for(let word of forbiddenWords){
    if (code.search(word.toUpperCase()) > -1) { return generateEventCode(); }
  }

  return code;
};

const sendScheduleMessage = async (message, targetDate) => {
  const eventCode = generateEventCode();

  const embed = new Discord.MessageEmbed()
    .setTitle('A new event has been scheduled!')
    .setColor('#6081cb')
    .setDescription(`**${message.author.username}** wants to schedule a game at the time listed below.` +
      `\nReact with ⚔ if you intend to join this game.` +
      `\nReact with 🐔 if you don\'t know yet.`)
    .addField('Event Code', eventCode)
    .setTimestamp(targetDate.getTime());

  message.channel.send(embed).then(async (scheduleMessage) => {
    // Save scheduled game to database
    const guildData = await dbQueryOne(`SELECT id FROM guild_data WHERE guildId=?`, [message.guild.id]);
    if (!guildData) {
      throw new Error(`Unable to find guild ${message.guild.name} (${message.guild.id}) in guild_data table.`);
    }
    let sql = `INSERT INTO scheduled_events
             (guildDataId, timestamp, channelId, messageId, schedulingUserId, schedulingUserTag, eventCode)
             VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await dbExecute(sql, [guildData.id, targetDate.getTime(), scheduleMessage.channel.id, scheduleMessage.id,
      message.member.user.id, message.member.user.tag, eventCode]);

    // Put appropriate reactions onto the message
    scheduleMessage.react('⚔');
    scheduleMessage.react('🐔');
  }).catch((error) => generalErrorHandler(error));
};

module.exports = {
  category: 'Event Scheduling',
  commands: [
    {
      name: 'schedule',
      description: 'View upcoming events or schedule a new one',
      longDescription: "View upcoming events or Schedule a new one. Allowed times look like:\n\n" +
        "`X:00`: Schedule a game for the next occurrence of the provided minutes value\n" +
        "`HH:MM TZ`: Schedule a game for the next occurrence of the provided time.\n" +
        "`MM/DD/YYYY HH:MM TZ`: Schedule a game for the specific provided date and time.\n" +
        "`YYYY-MM-DD HH:MM TZ` Schedule a game for a specific provided date and time.\n\n" +
        "Strict ISO-8601 formatted datetime values are also allowed.\n" +
        "A list of timezones can be found on the Wikipedia timezone page under the `TZ database name` column.\n" +
        "https://en.wikipedia.org/wiki/List_of_tz_database_time_zones",
      aliases: [],
      usage: '`!aginah schedule [role date/time]`',
      guildOnly: true,
      minimumRole: null,
      adminOnly: false,
      async execute(message, args) {
        if (args.length === 0) {
          let sql = `SELECT se.timestamp, se.schedulingUserTag, se.channelId, se.messageId, se.eventCode,
                            (SELECT COUNT(*) FROM event_attendees WHERE eventId=se.id) AS rsvpCount
                     FROM scheduled_events se
                     JOIN guild_data gd ON se.guildDataId = gd.id
                     WHERE gd.guildId=?
                       AND se.timestamp > ?`;
          const games = await dbQueryAll(sql, [message.guild.id, new Date().getTime()]);
          for (let game of games) {
            const channel = message.guild.channels.resolve(game.channelId);
            if (!channel) { continue; }
            channel.messages.fetch(game.messageId).then(
              (scheduleMessage) => {
                const embed = new Discord.MessageEmbed()
                  .setTitle('Upcoming Event')
                  .setColor('#6081cb')
                  .setDescription(`**${game.schedulingUserTag}** scheduled a game at the time listed below.`)
                  .setURL(scheduleMessage.url)
                  .addField('Event Code', game.eventCode)
                  .addField('Current RSVPs', game.rsvpCount)
                  .setTimestamp(parseInt(game.timestamp, 10));
                message.channel.send(embed);
              }).catch((err) => generalErrorHandler(err));
          }

          if (games.length === 0) { return message.channel.send("There are currently no games scheduled."); }
          return;
        }

        if (args.length < 2) {
          return message.channel.send("Looks like you're missing some arguments. Use " +
            "`!aginah help schedule` for more info.");
        }

        // Remove the role argument, since we don't do anything with it
        await args.shift();

        const timeString = args.join(' ').toUpperCase().trim();
        const currentDate = new Date();

        // Format: Strict ISO-8601
        const iso8601Pattern = new RegExp(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(Z|([+-]\d{2}:\d{2}))$/);

        // Format: MM/DD/YYYY HH:II TZ
        const mdyPattern = new RegExp(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)$/);

        // Format: YYYY-MM-DD HH:MM TZ
        const isoSimplePattern = new RegExp(/^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)$/);

        // Format: HH:MM TZ
        const specificHourPattern = new RegExp(/^(\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)$/);

        // Format XX:30
        const nextHourPattern = new RegExp(/^X{1,2}:(\d{2})$/);

        if (timeString.search(iso8601Pattern) > -1) {
          const targetDate = new Date(timeString);
          if (isNaN(targetDate.getTime())) {
            return message.channel.send("The date you provided is invalid.");
          }

          if (targetDate.getTime() < currentDate.getTime()) {
            return message.channel.send("You can't schedule a game in the past!");
          }

          return sendScheduleMessage(message, targetDate);

        } else if (timeString.search(mdyPattern) > -1) {
          const patternParts = timeString.match(mdyPattern);
          if (!moment.tz.zone(patternParts[6])) {
            return message.channel.send("I don't recognize that timezone! Does your timezone " +
              "change for daylight savings time?");
          }

          const targetDate = new Date(timeString);
          if (isNaN(targetDate.getTime())) {
            return message.channel.send("The date you provided is invalid.");
          }

          if (targetDate.getTime() < currentDate.getTime()) {
            return message.channel.send("You can't schedule a game in the past!");
          }

          return sendScheduleMessage(message, targetDate);

        } else if (timeString.search(isoSimplePattern) > -1) {
          const patternParts = timeString.match(isoSimplePattern);
          if (!moment.tz.zone(patternParts[6])) {
            return message.channel.send("I don't recognize that timezone! Does your timezone " +
              "change for daylight savings time?");
          }
          const zoneOffset = getZoneOffset(patternParts[6]);
          if (isNaN(zoneOffset)) {
            return message.channel.send("I couldn't schedule your game because the timezone provided " +
              "could not be used to create a valid date object.");
          }

          const sign = zoneOffset < 1 ? '-' : '+';
          const targetDate = new Date(`${patternParts[1]}-${patternParts[2]}-${patternParts[3]}T` +
            `${patternParts[4]}:${patternParts[5]}${sign}` +
            `${Math.abs(zoneOffset).toString().padStart(2, '0')}:00`);

          if (targetDate.getTime() < currentDate.getTime()) {
            return message.channel.send("You can't schedule a game in the past!");
          }

          return sendScheduleMessage(message, targetDate);

        } else if (timeString.search(specificHourPattern) > -1) {
          const patternParts = timeString.match(specificHourPattern);
          if (parseInt(patternParts[1], 10) > 24) {
            return message.channel.send("There are only 24 hours in a day!");
          }

          if (parseInt(patternParts[2], 10) > 59) {
            return message.channel.send("There are only 60 minutes in an hour!");
          }

          if (!moment.tz.zone(patternParts[3])) {
            return message.channel.send("I don't recognize that timezone! Does your timezone " +
              "change for daylight savings time?");
          }
          const zoneOffset = getZoneOffset(patternParts[3]);
          if (isNaN(zoneOffset)) {
            return message.channel.send("I couldn't schedule your game because the timezone provided " +
              "could not be used to create a valid date object.");
          }

          const targetDate = new Date(message.createdTimestamp);
          targetDate.setUTCHours((parseInt(patternParts[1], 10) - zoneOffset) % 24);
          targetDate.setUTCMinutes(parseInt(patternParts[2], 10));

          // If the offset UTC hour is in the past, bump the date up by one day
          if (targetDate.getTime() < currentDate.getTime()) {
            targetDate.setDate(targetDate.getDate() + 1);
          }

          return sendScheduleMessage(message, targetDate);

        } else if (timeString.search(nextHourPattern) > -1) {
          const patternParts = timeString.match(nextHourPattern);
          if (patternParts[1] > 59) {
            return message.channel.send("There are only sixty minutes in an hour!");
          }
          const targetDate = new Date(`${currentDate.getUTCMonth()+1}/${currentDate.getUTCDate()}`+
            `/${currentDate.getUTCFullYear()} ${currentDate.getUTCHours()}:${patternParts[1]} UTC`);

          if (targetDate.getTime() < currentDate.getTime()) {
            targetDate.setUTCHours(targetDate.getUTCHours() + 1);
          }

          return sendScheduleMessage(message, targetDate);

        } else {
          return message.channel.send("Sorry, I don't understand that time. Use " +
            "`!aginah help schedule` for more info.");
        }
      }
    },
  ],
};