const Discord = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');
const { generalErrorHandler } = require('../errorHandlers');
const { dbQueryOne, dbQueryAll, dbExecute, verifyIsAdmin,
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

const sendScheduleMessage = async (interaction, targetDate) => {
  const eventCode = generateEventCode();

  const embedTimestamp = Math.floor(targetDate.getTime()/1000);
  const embed = new Discord.EmbedBuilder()
    .setTitle(`New Event on <t:${embedTimestamp}:F>`)
    .setColor('#6081cb')
    .setDescription(`**${interaction.user.username}** has scheduled a new event!` +
      '\nReact with 👍 if you intend to join this event.' +
      '\nReact with 🤔 if you don\'t know yet.')
    .addFields({ name: 'Event Code', value: eventCode });

  interaction.reply({ embeds: [embed] }).then(async (scheduleMessage) => {
    // Save scheduled game to database
    const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
    if (!guildData) {
      throw new Error(`Unable to find guild ${interaction.guild.name} (${interaction.guildId}) in guild_data table.`);
    }
    const sql = `INSERT INTO scheduled_events
             (guildDataId, timestamp, channelId, messageId, schedulingUserId, schedulingUserTag, eventCode)
             VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await dbExecute(sql, [guildData.id, targetDate.getTime(), scheduleMessage.channel.id, scheduleMessage.id,
      interaction.user.id, interaction.user.tag, eventCode]);

    // Put appropriate reactions onto the message
    await scheduleMessage.react('👍');
    await scheduleMessage.react('🤔');

    // Update schedule messages
    await updateScheduleBoard(interaction.client, interaction.guild);
  }).catch((error) => generalErrorHandler(error));
};

module.exports = {
  category: 'Event Scheduling',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('scheduleView')
        .setDescription('View upcoming events')
        .setDMPermission(false),
      async execute(interaction) {
        await interaction.deferReply();

        // Check if the schedule boards feature is enabled
        let sql = `SELECT sb.channelId, sb.messageId
                   FROM schedule_boards sb
                   JOIN guild_data gd ON sb.guildDataId=gd.id
                   WHERE gd.guildId=?`;
        const boards = await dbQueryAll(sql, [interaction.guildId]);
        if (boards.length > 0) {
          // Fetch channel and message of schedule boards in this guild
          const guildBoards = [];
          for (let board of boards) {
            const channel = await interaction.guild.channels.fetch(board.channelId);
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
            return interaction.followUp({ embeds: [embed], ephemeral: true });
          }
        }

        // Send individual messages for each upcoming event
        sql = `SELECT se.timestamp, se.schedulingUserTag, se.channelId, se.messageId, se.eventCode
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND se.timestamp > ?
                   ORDER BY se.timestamp`;
        const games = await dbQueryAll(sql, [interaction.guildId, new Date().getTime()]);

        if (games.length === 0) {
          return interaction.followUp({ content: 'There are currently no games scheduled.', ephemeral: true });
        }

        for (let game of games) {
          const channel = interaction.guild.channels.resolve(game.channelId);
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
          await interaction.followUp({ embeds: [embed], ephemeral: true });
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('scheduleNew')
        .setDescription('Schedule a new event. If you schedule a game by mistake, you may use the `/cancel` ' +
          'command to cancel it.')
        .addStringOption((opt) => opt
          .setName('date')
          .setDescription('Format: YYYY-MM-DD')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('time')
          .setDescription('24-Hour format: HH:MM')
          .setRequired(true))
        .addIntegerOption((opt) => opt
          .setName('timezone')
          .setDescription('Nearest timezone to you')
          .setRequired(false)
          .addChoices(
            { name: 'UTC - 12', value: -12 },
            { name: 'UTC - 11', value: -11 },
            { name: 'UTC - 10', value: -10 },
            { name: 'UTC - 9', value: -9 },
            { name: 'UTC - 8', value: -8 },
            { name: 'UTC - 7', value: -7 },
            { name: 'UTC - 6', value: -6 },
            { name: 'UTC - 5', value: -5 },
            { name: 'UTC - 4', value: -4 },
            { name: 'UTC - 3', value: -3 },
            { name: 'UTC - 2', value: -2 },
            { name: 'UTC - 1', value: -1 },
            { name: 'UTC + 0', value: 0 },
            { name: 'UTC + 1', value: 1 },
            { name: 'UTC + 2', value: 2 },
            { name: 'UTC + 3', value: 3 },
            { name: 'UTC + 4', value: 4 },
            { name: 'UTC + 5', value: 5 },
            { name: 'UTC + 6', value: 6 },
            { name: 'UTC + 7', value: 7 },
            { name: 'UTC + 8', value: 8 },
            { name: 'UTC + 9', value: 9 },
            { name: 'UTC + 10', value: 10 },
            { name: 'UTC + 11', value: 11 },
            { name: 'UTC + 12', value: 12 },
          ))
        .setDMPermission(false),
      async execute(interaction) {
        const dateString = interaction.options.getString('date');
        const timeString = interaction.options.getString('time');
        const utcOffset = interaction.options.getInteger('timezone');

        if (!(new RegExp(/\d{4}-\d{2}-\d{2}/).test(dateString))) {
          return interaction.reply({
            content: 'Invalid date format provided. Must be of format: YYYY-MM-DD.',
            ephemeral: true,
          });
        }

        if (!(new RegExp(/\d{2}:\d{2}/).test(timeString))) {
          return interaction.reply({
            content: 'Invalid time format provided. Must be of format: HH:MM.',
            ephemeral: true,
          });
        }

        const dateTimeString = (utcOffset > 0) ?
          `${dateString}T${timeString}:00+${utcOffset.toString().padStart(2,'0')}:00` :
          `${dateString}T${timeString}:00-${utcOffset.toString().padStart(2,'0')}:00`;

        try{
          const currentDate = new Date();
          const targetDate = new Date(dateTimeString);

          if (targetDate.getTime() < currentDate.getTime()) {
            return interaction.reply({
              content: 'You can\'t schedule a game in the past!',
              ephemeral: true,
            });
          }

          return sendScheduleMessage(interaction, targetDate);
        } catch (error) {
          if (error.name === 'TimeParserValidationError') {
            return interaction.channel.send(error.message);
          }
          generalErrorHandler(error);
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('scheduleCancel')
        .setDescription('Cancel an upcoming scheduled event. A game can only be cancelled by a moderator or by the ' +
          'user who scheduled it.')
        .addStringOption((opt) => opt
          .setName('eventCode')
          .setDescription('Six character code of the upcoming event you wish to cancel.')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const eventCode = interaction.options.getString('eventCode');

        let sql = `SELECT se.id, se.channelId, se.messageId, se.schedulingUserId, se.schedulingUserTag
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND se.eventCode=?
                     AND timestamp > ?`;
        const eventData = await dbQueryOne(sql, [
          interaction.guildId, eventCode.toUpperCase(), new Date().getTime().toString(),
        ]);

        // If no event is found, notify the user
        if (!eventData) {
          return await interaction.reply('There is no upcoming event with that code.');
        }

        // If the user is not a moderator and not the scheduling user, deny the cancellation
        if (interaction.user.id !== eventData.schedulingUserId) {
          const guildMember = await interaction.guild.members.fetch(interaction.user.id);
          if (guildMember && !verifyIsAdmin(guildMember)) {
            return interaction.reply('This game can only be cancelled by the user who scheduled it ' +
              `(${eventData.schedulingUserTag}), or by an administrator.`);
          }
        }

        // The game is to be cancelled. Replace the schedule message with a cancellation notice
        const scheduleChannel = await interaction.guild.channels.fetch(eventData.channelId);
        const scheduleMsg = await scheduleChannel.messages.fetch(eventData.messageId);
        await scheduleMsg.edit({
          content: `This game has been cancelled by ${interaction.user}.`,
          embeds: [],
        });

        // Remove all reactions from the message
        await scheduleMsg.reactions.removeAll();

        // Remove the game's entry from the database
        await dbExecute('DELETE FROM scheduled_events WHERE id=?', [eventData.id]);

        await updateScheduleBoard(interaction.client, interaction.guild);
        return interaction.reply(`Event with code ${eventCode} has been cancelled.`);
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('scheduleBoardPost')
        .setDescription('Create and pin a message containing an automatically updated list of scheduled events ' +
          'to this channel. The message will automatically update whenever an event is scheduled or cancelled, ' +
          'and will automatically remove past events once per hour.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        await interaction.deferReply();

        // Check for existing schedule board in this channel
        let sql = `SELECT sb.id, sb.messageId
                   FROM schedule_boards sb
                   JOIN guild_data gd ON sb.guildDataId = gd.id
                   WHERE gd.guildId=?
                        AND sb.channelId=?`;
        const existingBoard = await dbQueryOne(sql, [interaction.guildId, interaction.channel.id]);
        if (existingBoard) {
          // Fetch message object for existing schedule board
          const existingMessage = await interaction.channel.messages.fetch(existingBoard.messageId);
          // Schedule board already exists, and message is present in channel
          if (existingMessage) {
            return interaction.followUp('This channel already has a schedule board, located here:' +
              `\n${existingMessage.url}`);
          }

          // Message object has been deleted. Remove its entry from schedule_boards
          await dbExecute('DELETE FROM schedule_boards WHERE id=?', [existingMessage.id]);
          await interaction.followUp('It appears a schedule board previously existed in this channel but was ' +
            'deleted without my knowledge (I blame Discord). A new schedule board is being created.');
        }

        // Create schedule board message, pin it, add schedule_boards entry, update contents
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        const scheduleBoardMessage = await interaction.channel.send('Fetching scheduled events. Please wait...');
        await scheduleBoardMessage.pin();
        sql = 'INSERT INTO schedule_boards (guildDataId, channelId, messageId) VALUES(?, ?, ?)';
        await dbExecute(sql, [guildData.id, interaction.channel.id, scheduleBoardMessage.id]);
        await updateScheduleBoard(interaction.client, interaction.guild);
        return interaction.followUp('Schedule board created.');
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('scheduleBoardDelete')
        .setDescription('Delete a schedule board if it exists in this channel.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        // Check for existing schedule board in this channel
        let sql = `SELECT sb.id, sb.messageId
                   FROM schedule_boards sb
                   JOIN guild_data gd ON sb.guildDataId = gd.id
                   WHERE gd.guildId=?
                        AND sb.channelId=?`;
        const existingBoard = await dbQueryOne(sql, [interaction.guildId, interaction.channel.id]);
        if (!existingBoard) {
          return interaction.reply('No message board exists in this channel.');
        }

        // Delete schedule board message
        const board = await interaction.channel.messages.fetch(existingBoard.messageId);
        await board.delete();

        // Delete row from schedule_boards
        await dbExecute('DELETE FROM schedule_boards WHERE id=?', [existingBoard.id]);
        return interaction.reply('Schedule board deleted.');
      }
    },
  ],
};
