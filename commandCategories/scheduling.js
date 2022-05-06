const Discord = require('discord.js');
const { generalErrorHandler } = require('../errorHandlers');
const moment = require('moment-timezone');
const { dbQueryOne, dbQueryAll, dbExecute, verifyModeratorRole, parseTimeString } = require('../lib');
const forbiddenWords = require('../assets/forbiddenWords.json');

// Return the offset in hours of a given timezone
const getZoneOffset = (zone) => 0 - moment.tz.zone(zone).utcOffset(new Date().getTime()) / 60;

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

  const embedTimestamp = Math.floor(targetDate.getTime()/1000);
  const embed = new Discord.MessageEmbed()
    .setTitle('A new event has been scheduled!')
    .setColor('#6081cb')
    .setDescription(`**${message.author.username}** wants to schedule a game for <t:${embedTimestamp}:F>.` +
      `\nReact with 👍 if you intend to join this game.` +
      `\nReact with 🤔 if you don\'t know yet.`)
    .addField('Event Code', eventCode)
    .setTimestamp(targetDate.getTime());

  message.channel.send({ embeds: [embed] }).then(async (scheduleMessage) => {
    // Save scheduled game to database
    const guildData = await dbQueryOne(`SELECT id FROM guild_data WHERE guildId=?`, [message.guild.id]);
    if (!guildData) {
      throw new Error(`Unable to find guild ${message.guild.name} (${message.guild.id}) in guild_data table.`);
    }
    sql = `INSERT INTO scheduled_events
             (guildDataId, timestamp, channelId, messageId, schedulingUserId, schedulingUserTag, eventCode)
             VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await dbExecute(sql, [guildData.id, targetDate.getTime(), scheduleMessage.channel.id, scheduleMessage.id,
      message.member.user.id, message.member.user.tag, eventCode]);

    // Put appropriate reactions onto the message
    await scheduleMessage.react('👍');
    await scheduleMessage.react('🤔');
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
        "`X+2:15` Schedule a game for a set number of hours in the future, at the provided minute value\n" +
        "`HH:MM TZ`: Schedule a game for the next occurrence of the provided time.\n" +
        "`MM/DD/YYYY HH:MM TZ`: Schedule a game for the specific provided date and time.\n" +
        "`YYYY-MM-DD HH:MM TZ` Schedule a game for a specific provided date and time.\n\n" +
        "In all cases where an hour value is accepted, 24-hour time is required.\n" +
        "Strict ISO-8601 formatted datetime values are allowed.\n" +
        "UNIX Timestamps are allowed.\n" +
        "A list of timezones can be found on the Wikipedia timezone page under the `TZ database name` column.\n" +
        "https://en.wikipedia.org/wiki/List_of_tz_database_time_zones\n" +
        "If you make a mistake while scheduling a game, consider using `noping` instead of a role when retrying the " +
        "command to avoid pinging people multiple times.",
      aliases: [],
      usage: '`!aginah schedule [date/time]`',
      guildOnly: true,
      moderatorRequired: false,
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
                const embedTimestamp = Math.floor(game.timestamp/1000);
                const embed = new Discord.MessageEmbed()
                  .setTitle('Upcoming Event')
                  .setColor('#6081cb')
                  .setDescription(`**${game.schedulingUserTag}** scheduled a game for <t:${embedTimestamp}:F>.`)
                  .setURL(scheduleMessage.url)
                  .addField('Planning Channel', `#${channel.name}`)
                  .addField('Event Code', game.eventCode)
                  .addField('Current RSVPs', game.rsvpCount)
                  .setTimestamp(parseInt(game.timestamp, 10));
                message.channel.send({ embeds: [embed] });
              }).catch((err) => generalErrorHandler(err));
          }

          if (games.length === 0) { return message.channel.send("There are currently no games scheduled."); }
          return;
        }

        const timeString = args.join(' ').toUpperCase().trim();
        const currentDate = new Date();

        try{
          const targetDate = parseTimeString(timeString);
          if (targetDate.getTime() < currentDate.getTime()) {
            return message.channel.send('You can\'t schedule a game in the past!');
          }
          return sendScheduleMessage(message, targetDate);
        } catch (error) {
          if (error.name === 'TimeParserValidationError') {
            return message.channel.send(error.message);
          }
          generalErrorHandler(error);
        }

      }
    },
    {
      name: 'cancel',
      description: 'Cancel an upcoming scheduled event',
      longDescription: "Cancel an upcoming scheduled event. A game can only be cancelled by a moderator or by the " +
        "user who scheduled it.",
      aliases: [],
      usage: '`!aginah cancel eventCode`',
      guildOnly: true,
      moderatorRequired: false,
      adminOnly: false,
      async execute(message, args) {
        let sql = `SELECT se.id, se.channelId, se.messageId, se.schedulingUserId, se.schedulingUserTag
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND se.eventCode=?
                     AND timestamp > ?`;
        const eventData = await dbQueryOne(sql, [
          message.guild.id, args[0].toUpperCase(), new Date().getTime().toString(),
        ]);

        // If no event is found, notify the user
        if (!eventData) {
          return await message.channel.send('There is no upcoming event with that code.');
        }

        // If the user is not a moderator and not the scheduling user, deny the cancellation
        if (message.author.id !== eventData.schedulingUserId && !await verifyModeratorRole(message.user)) {
          return await message.channel.send(`This game can only be cancelled by the user who scheduled it ` +
          `(${eventData.schedulingUserTag}), or by a moderator.`);
        }

        // The game is to be cancelled. Replace the schedule message with a cancellation notice
        const scheduleMsg = message.guild.channels.resolve(eventData.channelId).messages.resolve(eventData.messageId);
        await scheduleMsg.edit({
          content: `This game has been cancelled by ${message.author}.`,
          embeds: [],
        });

        // Remove all reactions from the message
        await scheduleMsg.reactions.removeAll();

        // Remove the game's entry from the database
        await dbExecute(`DELETE FROM event_attendees WHERE eventId=?`, [eventData.id]);
        await dbExecute(`DELETE FROM scheduled_events WHERE id=?`, [eventData.id]);
      }
    },
  ],
};
