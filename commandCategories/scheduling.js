const Discord = require('discord.js');
const { generalErrorHandler } = require('../errorHandlers');
const { dbQueryOne, dbQueryAll, dbExecute, verifyModeratorRole, parseTimeString,
  updateScheduleBoard } = require('../lib');
const forbiddenWords = require('../assets/forbiddenWords.json');

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
  const embed = new Discord.EmbedBuilder()
    .setTitle(`New Event on <t:${embedTimestamp}:F>`)
    .setColor('#6081cb')
    .setDescription(`**${message.author.username}** has scheduled a new event!` +
      '\nReact with 👍 if you intend to join this event.' +
      '\nReact with 🤔 if you don\'t know yet.')
    .addFields({ name: 'Event Code', value: eventCode });

  message.channel.send({ embeds: [embed] }).then(async (scheduleMessage) => {
    // Save scheduled game to database
    const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [message.guild.id]);
    if (!guildData) {
      throw new Error(`Unable to find guild ${message.guild.name} (${message.guild.id}) in guild_data table.`);
    }
    const sql = `INSERT INTO scheduled_events
             (guildDataId, timestamp, channelId, messageId, schedulingUserId, schedulingUserTag, eventCode)
             VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await dbExecute(sql, [guildData.id, targetDate.getTime(), scheduleMessage.channel.id, scheduleMessage.id,
      message.member.user.id, message.member.user.tag, eventCode]);

    // Put appropriate reactions onto the message
    await scheduleMessage.react('👍');
    await scheduleMessage.react('🤔');

    // Update schedule messages
    await updateScheduleBoard(message.client, message.guild);
  }).catch((error) => generalErrorHandler(error));
};

// TODO: Convert to slash commands

module.exports = {
  category: 'Event Scheduling',
  commands: [
    {
      name: 'schedule',
      description: 'View upcoming events or schedule a new one',
      longDescription: 'View upcoming events or Schedule a new one. Allowed times look like:\n\n' +
        '`X:00`: Schedule a game for the next occurrence of the provided minutes value\n' +
        '`X+2:15` Schedule a game for a set number of hours in the future, at the provided minute value\n' +
        '`HH:MM TZ`: Schedule a game for the next occurrence of the provided time.\n' +
        '`MM/DD/YYYY HH:MM TZ`: Schedule a game for the specific provided date and time.\n' +
        '`YYYY-MM-DD HH:MM TZ` Schedule a game for a specific provided date and time.\n\n' +
        'In all cases where an hour value is accepted, 24-hour time is required.\n' +
        'Strict ISO-8601 formatted datetime values are allowed.\n' +
        'UNIX Timestamps are allowed.\n' +
        'A list of timezones can be found on the Wikipedia timezone page under the `TZ database name` column.\n' +
        'https://en.wikipedia.org/wiki/List_of_tz_database_time_zones\n' +
        'If you schedule a game by mistake, you may use the `!aginah cancel eventCode` command to cancel it.',
      aliases: [],
      usage: '`!aginah schedule [date/time]`',
      guildOnly: true,
      moderatorRequired: false,
      adminOnly: false,
      async execute(message, args) {
        if (args.length === 0) {
          // Check if the schedule boards feature is enabled
          let sql = `SELECT sb.channelId, sb.messageId
                     FROM schedule_boards sb
                     JOIN guild_data gd ON sb.guildDataId=gd.id
                     WHERE gd.guildId=?`;
          const boards = await dbQueryAll(sql, [message.guild.id]);
          if (boards.length > 0) {
            // Fetch channel and message of schedule boards in this guild
            const guildBoards = [];
            for (let board of boards) {
              const channel = await message.guild.channels.fetch(board.channelId);
              if (!channel) { continue; }
              const thisMsg = await channel.messages.fetch(board.messageId);
              if (!thisMsg) { continue; }
              guildBoards.push({ channel, message: thisMsg });
            }

            // Create an embed and populate its fields with schedule boards
            if (guildBoards.length > 0) {
              const boardFields = [];
              for (let board of guildBoards) {
                boardFields.push({
                  name: `${board.pinned ? 'Pinned' : 'Located'} in #${board.channel.name}`,
                  value: `[Link to Schedule Board](${board.message.url})`,
                });
              }

              // Send a message alerting the user of the available schedule boards
              const embed = new Discord.EmbedBuilder()
                .setTitle('This server has schedule boards enabled!')
                .setColor('#6081cb')
                .setDescription('Schedule boards track all upcoming events, and update automatically.')
                .addFields(boardFields);
              return message.channel.send({ embeds: [embed] });
            }
          }

          // Send individual messages for each upcoming event
          sql = `SELECT se.timestamp, se.schedulingUserTag, se.channelId, se.messageId, se.eventCode
                     FROM scheduled_events se
                     JOIN guild_data gd ON se.guildDataId = gd.id
                     WHERE gd.guildId=?
                       AND se.timestamp > ?
                     ORDER BY se.timestamp`;
          const games = await dbQueryAll(sql, [message.guild.id, new Date().getTime()]);
          for (let game of games) {
            const channel = message.guild.channels.resolve(game.channelId);
            if (!channel) { continue; }
            const scheduleMessage = await channel.messages.fetch(game.messageId);

            // Determine RSVP count
            const rsvps = new Map();
            for (let reaction of scheduleMessage.reactions.cache) {
              const reactors = await reaction[1].users.fetch();
              reactors.each((reactor) => {
                if (reactor.bot) { return; }
                if (rsvps.has(reactor.id)) { return; }
                rsvps.set(reactor.id, reactor);
              });
            }

            const embed = new Discord.EmbedBuilder()
              .setTitle(`Upcoming Event on <t:${Math.floor(game.timestamp / 1000)}:F>`)
              .setColor('#6081cb')
              .setDescription('**Click the title of this message to jump to the original.**')
              .setURL(scheduleMessage.url)
              .addFields(
                { name: 'Scheduled By', value: `@${game.schedulingUserTag}` },
                { name: 'Planning Channel', value: `#${channel.name}` },
                { name: 'Event Code', value: game.eventCode },
                { name: 'Current RSVPs', value: rsvps.size.toString() },
              );
            await message.channel.send({ embeds: [embed] });
          }

          if (games.length === 0) { return message.channel.send('There are currently no games scheduled.'); }
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
      longDescription: 'Cancel an upcoming scheduled event. A game can only be cancelled by a moderator or by the ' +
        'user who scheduled it.',
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
          return await message.channel.send('This game can only be cancelled by the user who scheduled it ' +
          `(${eventData.schedulingUserTag}), or by a moderator.`);
        }

        // The game is to be cancelled. Replace the schedule message with a cancellation notice
        const scheduleChannel = await message.guild.channels.fetch(eventData.channelId);
        const scheduleMsg = await scheduleChannel.messages.fetch(eventData.messageId);
        await scheduleMsg.edit({
          content: `This game has been cancelled by ${message.author}.`,
          embeds: [],
        });

        // Remove all reactions from the message
        await scheduleMsg.reactions.removeAll();

        // Remove the game's entry from the database
        await dbExecute('DELETE FROM scheduled_events WHERE id=?', [eventData.id]);

        await updateScheduleBoard(message.client, message.guild);
      }
    },
    {
      name: 'post-schedule-board',
      description: 'Create and pin a message containing an automatically updated list of scheduled events to ' +
        'this channel.',
      longDescription: 'Create and pin a message containing an automatically updated list of scheduled events ' +
        'to this channel. The message will automatically update whenever an event is scheduled or cancelled, ' +
        'and will automatically remove past events once per hour.',
      aliases: [],
      usage: '`!aginah post-schedule-board`',
      guildOnly: true,
      moderatorRequired: true,
      adminOnly: false,
      async execute(message) {
        // Check for existing schedule board in this channel
        let sql = `SELECT sb.id, sb.messageId
                   FROM schedule_boards sb
                   JOIN guild_data gd ON sb.guildDataId = gd.id
                   WHERE gd.guildId=?
                        AND sb.channelId=?`;
        const existingBoard = await dbQueryOne(sql, [message.guild.id, message.channel.id]);
        if (existingBoard) {
          // Fetch message object for existing schedule board
          const existingMessage = await message.channel.messages.fetch(existingBoard.messageId);
          // Schedule board already exists, and message is present in channel
          if (existingMessage) {
            return message.channel.send('This channel already has a schedule board, located here:' +
              `\n${existingMessage.url}`);
          }

          // Message object has been deleted. Remove its entry from schedule_boards
          await dbExecute('DELETE FROM schedule_boards WHERE id=?', [existingMessage.id]);
          await message.channel.send('It appears a schedule board previously existed in this channel but was ' +
            'deleted without my knowledge (I blame Discord). A new schedule board is being created.');
        }

        // Create schedule board message, pin it, add schedule_boards entry, update contents
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [message.guild.id]);
        const scheduleBoardMessage = await message.channel.send('Fetching scheduled events. Please wait...');
        await scheduleBoardMessage.pin();
        sql = 'INSERT INTO schedule_boards (guildDataId, channelId, messageId) VALUES(?, ?, ?)';
        await dbExecute(sql, [guildData.id, message.channel.id, scheduleBoardMessage.id]);
        await updateScheduleBoard(message.client, message.guild);
      }
    },
    {
      name: 'delete-schedule-board',
      description: 'Delete a schedule board if it exists in this channel.',
      longDescription: null,
      aliases: [],
      usage: '`!aginah delete-schedule-board`',
      guildOnly: true,
      moderatorRequired: true,
      adminOnly: false,
      async execute(message) {
        // Check for existing schedule board in this channel
        let sql = `SELECT sb.id, sb.messageId
                   FROM schedule_boards sb
                   JOIN guild_data gd ON sb.guildDataId = gd.id
                   WHERE gd.guildId=?
                        AND sb.channelId=?`;
        const existingBoard = await dbQueryOne(sql, [message.guild.id, message.channel.id]);
        if (!existingBoard) {
          return message.channel.send('No message board exists in this channel.');
        }

        // Delete schedule board message
        const board = await message.channel.messages.fetch(existingBoard.messageId);
        await board.delete();

        // Delete row from schedule_boards
        await dbExecute('DELETE FROM schedule_boards WHERE id=?', [existingBoard.id]);
        return message.channel.send('Schedule board deleted.');
      }
    },
  ],
};
