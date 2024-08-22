const Discord = require('discord.js');
const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require('discord.js');
const { generalErrorHandler } = require('../errorHandlers');
const { dbQueryOne, dbQueryAll, dbExecute, updateScheduleBoard, verifyModeratorRole} = require('../lib');
const forbiddenWords = require('../assets/forbiddenWords.json');

const isRolePingable = async (guildId, role) => {
  // Prevent pinging the @everyone role in all cases
  if (role.name === '@everyone') { return false; }

  // Determine if whitelist is enabled for the specified guild
  let sql = `SELECT 1
             FROM guild_options go
             JOIN guild_data gd ON go.guildDataId = gd.id
             WHERE gd.guildId=?
                AND roleWhitelist=1`;
  const guildOptions = await dbQueryOne(sql, [guildId]);

  // If whitelist is not enabled, all roles are pingable
  if (!guildOptions) { return true; }

  // Determine if role exists in whitelist
  sql = `SELECT 1
               FROM pingable_roles pr
               JOIN guild_data gd ON pr.guildDataId = gd.id
               JOIN guild_options go ON gd.id = go.guildDataId 
               WHERE gd.guildId=?
                    AND pr.roleId=?
                    AND go.roleWhitelist=1`;
  const pingableRole = await dbQueryOne(sql, [guildId, role.id]);

  // If role exists in whitelist, it is pingable
  return !!pingableRole;
};

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

const sendScheduleMessage = async (interaction, targetDate, title = null, pingRole = null, duration = null) => {
  // Fetch guild data
  const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
  if (!guildData) {
    throw new Error(`Unable to find guild ${interaction.guild.name} (${interaction.guildId}) in guild_data table.`);
  }

  // Fetch options
  const options = await dbQueryOne('SELECT * FROM guild_options WHERE guildDataId=?', [guildData.id]);

  const eventCode = generateEventCode();

  const embedTimestamp = Math.floor(targetDate.getTime()/1000);
  const embed = new Discord.EmbedBuilder()
    .setTitle(`${title || 'New Event'}`)
    .setDescription(
      `Starts <t:${embedTimestamp}:R> and should last ` +
      `${duration ? `about ${duration} hours` : 'an undisclosed amount of time'}.`
    )
    .setColor('#6081cb')
    .setAuthor({ name: interaction.member.displayName })
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: 'Event Code', value: eventCode.toUpperCase(), inline: true },
      { name: ' ', value: ' ', inline: true },
      { name: 'Date/Time', value: `<t:${embedTimestamp}:F>`, inline: true },
    );

  // Send schedule message
  const messageObject = {
    embeds: [embed],
    components: [
      new ActionRowBuilder()
        .addComponents(...[
          new ButtonBuilder()
            .setCustomId(`schedule-rsvp-${eventCode}`)
            .setLabel('Confirm RSVP')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`schedule-rsvpCancel-${eventCode}`)
            .setLabel('Cancel RSVP')
            .setStyle(ButtonStyle.Danger),
        ]),
    ]
  };
  if (pingRole) { messageObject.content = `${pingRole}`; }
  const scheduleMessage = await interaction.channel.send(messageObject);

  // Start a thread on the schedule message if appropriate
  let threadChannel = null;
  if (
    interaction.channel.type === Discord.ChannelType.GuildText &&  // Channel is a guild text channel
    options?.eventThreads                                          // Guild has event threads option enabled
  ) {
    // Create thread channel
    threadChannel = await scheduleMessage.startThread({
      name: title || `${interaction.member.displayName}'s Event`,
    });
    // Add creating user to the thread
    await threadChannel.members.add(interaction.user.id);

    // Grant pin permissions for the thread to the creating user
    await dbExecute('REPLACE INTO pin_permissions (guildDataId, channelId, userId) VALUES (?, ?, ?)', [
      guildData.id, threadChannel.id, interaction.user.id
    ]);
    await threadChannel.send(
      `${interaction.user} has been granted pin permissions in this channel. Use \`/pin\` and \`/unpin\`.`
    );
  }

  // Save scheduled event to database
  const sql = `INSERT INTO scheduled_events
             (guildDataId, timestamp, channelId, messageId, threadId, schedulingUserId, eventCode, title, duration)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await dbExecute(sql, [guildData.id, targetDate.getTime(), scheduleMessage.channel.id, scheduleMessage.id,
    threadChannel ? threadChannel.id : null, interaction.user.id, eventCode, title, duration || null]);

  // Update schedule messages
  await updateScheduleBoard(interaction.client, interaction.guild);
};

module.exports = {
  category: 'Event Scheduling',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-view')
        .setDescription('View upcoming events')
        .setDMPermission(false),
      async execute(interaction) {
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
            return interaction.reply({ embeds: [embed], ephemeral: true });
          }
        }

        // Send individual messages for each upcoming event
        sql = `SELECT se.timestamp, se.schedulingUserId, se.channelId, se.messageId, se.eventCode, se.title
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND se.timestamp > ?
                   ORDER BY se.timestamp`;
        const events = await dbQueryAll(sql, [interaction.guildId, new Date().getTime()]);

        if (events.length === 0) {
          return interaction.reply({ content: 'There are currently no events scheduled.', ephemeral: true });
        }

        try{
          // Looping over an unknown number of entries, so this might take a few seconds.
          await interaction.deferReply();

          for (let event of events) {
            const channel = interaction.guild.channels.resolve(event.channelId);
            if (!channel) { continue; }
            const scheduleMessage = await channel.messages.fetch(event.messageId);

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

            const schedulingUser = await interaction.guild.members.fetch(event.schedulingUserId);

            const embed = new Discord.EmbedBuilder()
              .setTitle(`${event.title || 'Upcoming Event'}\n<t:${Math.floor(event.timestamp / 1000)}:F>`)
              .setColor('#6081cb')
              .setDescription('**Click the title of this message to jump to the original.**')
              .setURL(scheduleMessage.url)
              .addFields(
                { name: 'Scheduled By', value: `${schedulingUser.displayName}` },
                { name: 'Planning Channel', value: `#${channel.name}` },
                { name: 'Event Code', value: event.eventCode },
                { name: 'Current RSVPs', value: rsvps.size.toString() },
              );
            await interaction.followUp({ embeds: [embed], ephemeral: true });
          }
        } catch(e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the scheduled events could not be listed.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-new')
        .setDescription('Schedule a new event.')
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
          .setRequired(true)
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
        .addStringOption((opt) => opt
          .setName('title')
          .setDescription('Title for this event')
          .setMaxLength(100)
          .setRequired(true))
        .addIntegerOption((opt) => opt
          .setName('duration')
          .setDescription('Number of hours you intend this event to run')
          .setRequired(true))
        .addRoleOption((opt) => opt
          .setName('ping-role')
          .setDescription('Optional role to ping for this event')
          .setRequired(false))
        .setDMPermission(false),
      async execute(interaction) {
        const title = interaction.options.getString('title');
        const pingRole = interaction.options.getRole('ping-role', false) ?? null;
        const dateString = interaction.options.getString('date');
        const timeString = interaction.options.getString('time');
        const utcOffset = interaction.options.getInteger('timezone');
        const duration = interaction.options.getInteger('duration');

        if (pingRole && !await isRolePingable(interaction.guild.id, pingRole)) {
          return interaction.reply({
            content: 'Permission to ping that role has not been granted.',
            ephemeral: true,
          });
        }

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

        const dateTimeString = (utcOffset >= 0) ?
          `${dateString}T${timeString}:00.000+${utcOffset.toString().padStart(2,'0')}:00` :
          `${dateString}T${timeString}:00.000-${Math.abs(utcOffset).toString().padStart(2,'0')}:00`;

        try{
          const currentDate = new Date();
          const targetDate = new Date(dateTimeString);

          if (isNaN(targetDate.getTime())) {
            return interaction.reply({
              content: 'The date you provided appears invalid.',
              ephemeral: true,
            });
          }

          if (targetDate.getTime() < currentDate.getTime()) {
            return interaction.reply({
              content: 'You can\'t schedule an event in the past!',
              ephemeral: true,
            });
          }

          await interaction.deferReply({ ephemeral: true });
          await sendScheduleMessage(interaction, targetDate, title, pingRole, duration);
          return interaction.followUp('New event created.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the event could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-new-ts')
        .setDescription('Schedule a new event based on a UNIX timestamp.')
        .addNumberOption((opt) => opt
          .setName('unix-timestamp')
          .setDescription('UNIX timestamp')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('title')
          .setDescription('Title for this event')
          .setMaxLength(100)
          .setRequired(true))
        .addIntegerOption((opt) => opt
          .setName('duration')
          .setDescription('Number of hours you intend this event to run')
          .setRequired(true))
        .addRoleOption((opt) => opt
          .setName('ping-role')
          .setDescription('Optional role to ping for this event')
          .setRequired(false))
        .setDMPermission(false),
      async execute(interaction) {
        const title = interaction.options.getString('title');
        const pingRole = interaction.options.getRole('ping-role', false) ?? null;
        const timestamp = Math.floor(interaction.options.getNumber('unix-timestamp')) * 1000;
        const duration = interaction.options.getInteger('duration');

        if (pingRole && !await isRolePingable(interaction.guild.id, pingRole)) {
          return interaction.reply({
            content: 'Permission to ping that role has not been granted.',
            ephemeral: true,
          });
        }

        try{
          const currentDate = new Date();
          const targetDate = new Date(timestamp);

          if (targetDate.getTime() < currentDate.getTime()) {
            return interaction.reply({
              content: 'You can\'t schedule an event in the past!',
              ephemeral: true,
            });
          }

          await interaction.deferReply({ ephemeral: true });
          await sendScheduleMessage(interaction, targetDate, title, pingRole, duration);
          return interaction.followUp('New event created.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the event could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-new-relative')
        .setDescription('Schedule a new event X hours and Y minutes in the future.')
        .addIntegerOption((opt) => opt
          .setName('hours')
          .setDescription('Hours in the future your event will start')
          .setRequired(true))
        .addIntegerOption((opt) => opt
          .setName('minutes')
          .setDescription('Minutes in the future your event will start')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('title')
          .setDescription('Title for this event')
          .setMaxLength(100)
          .setRequired(true))
        .addIntegerOption((opt) => opt
          .setName('duration')
          .setDescription('Number of hours you intend this event to run')
          .setRequired(true))
        .addRoleOption((opt) => opt
          .setName('ping-role')
          .setDescription('Optional role to ping for this event')
          .setRequired(false))
        .setDMPermission(false),
      async execute(interaction) {
        const title = interaction.options.getString('title');
        const pingRole = interaction.options.getRole('ping-role', false) ?? null;
        const hours = interaction.options.getInteger('hours');
        const minutes = interaction.options.getInteger('minutes');
        const duration = interaction.options.getInteger('duration');

        if (pingRole && !await isRolePingable(interaction.guild.id, pingRole)) {
          return interaction.reply({
            content: 'Permission to ping that role has not been granted.',
            ephemeral: true,
          });
        }

        try{
          const currentDate = new Date();
          const targetDate = new Date(new Date().getTime() + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000));

          if (targetDate.getTime() < currentDate.getTime()) {
            return interaction.reply({
              content: 'You can\'t schedule an event in the past!',
              ephemeral: true,
            });
          }

          await interaction.deferReply({ ephemeral: true });
          await sendScheduleMessage(interaction, targetDate, title, pingRole, duration);
          return interaction.followUp('New event created.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the event could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-adjust')
        .setDescription('Alter the start time of a scheduled event.')
        .addStringOption((opt) => opt
          .setName('event-code')
          .setDescription('Six character code of the upcoming event you wish to cancel.')
          .setRequired(true))
        .addIntegerOption((opt) => opt
          .setName('duration')
          .setDescription('Number of hours you intend this event to run')
          .setRequired(true))
        .addIntegerOption((opt) => opt
          .setName('days')
          .setDescription('Days to adjust the event')
          .setRequired(false))
        .addIntegerOption((opt) => opt
          .setName('hours')
          .setDescription('Hours to adjust the event')
          .setRequired(false))
        .addIntegerOption((opt) => opt
          .setName('minutes')
          .setDescription('Minutes to adjust the event')
          .setRequired(false))
        .setDMPermission(false),
      async execute(interaction) {
        await interaction.deferReply();

        const eventCode = interaction.options.getString('event-code');
        const days = interaction.options.getInteger('days', false) || 0;
        const hours = interaction.options.getInteger('hours', false) || 0;
        const minutes = interaction.options.getInteger('minutes', false) || 0;
        const duration = interaction.options.getInteger('duration');

        let sql = `SELECT se.id, se.timestamp, se.schedulingUserId, se.channelId, se.messageId, se.title
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND se.eventCode=?
                     AND timestamp > ?`;
        const eventData = await dbQueryOne(sql, [
          interaction.guildId, eventCode.toUpperCase(), new Date().getTime(),
        ]);

        // If no event is found, notify the user
        if (!eventData) {
          return interaction.followUp({
            content: 'There is no upcoming event with that code.',
            ephemeral: true,
          });
        }

        // If the user is not a moderator and not the scheduling user, deny the cancellation
        if ((interaction.user.id !== eventData.schedulingUserId) && !await verifyModeratorRole(interaction.member)) {
          const schedulingUser = await interaction.guild.members.fetch(eventData.schedulingUserId);
          return interaction.followUp({
            content: 'This event can only be cancelled by the user who scheduled it ' +
              `(${schedulingUser.displayName}), or by an administrator.`,
            ephemeral: true,
          });
        }

        const newTimestamp = Number(eventData.timestamp) + (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) +
          (minutes * 60 * 1000);

        if (new Date(newTimestamp).getTime() < new Date().getTime()) {
          return interaction.followUp('You cannot schedule a game in the past!');
        }

        // Update database
        await dbExecute(
          'UPDATE scheduled_events SET timestamp=?, duration=? WHERE id=?',
          [newTimestamp, duration || null, eventData.id]
        );

        // Update schedule message
        const channel = await interaction.guild.channels.fetch(eventData.channelId);
        const message = await channel.messages.fetch(eventData.messageId);

        const embedTimestamp = Math.floor(newTimestamp/1000);
        const embed = new Discord.EmbedBuilder()
          .setTitle(`${eventData.title || 'New Event'}`)
          .setDescription(
            `Starts <t:${embedTimestamp}:R> and should last ` +
            `${duration ? `about ${duration} hours` : 'an undisclosed amount of time'}.`
          )
          .setColor('#6081cb')
          .setAuthor({ name: interaction.member.displayName })
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: 'Event Code', value: eventCode.toUpperCase(), inline: true },
            { name: ' ', value: ' ', inline: true },
            { name: 'Date/Time', value: `<t:${embedTimestamp}:F>`, inline: true },
          );

        // Update schedule message
        const payload = {
          embeds: [embed],
          components: [
            new ActionRowBuilder()
              .addComponents(...[
                new ButtonBuilder()
                  .setCustomId(`schedule-rsvp-${eventCode}`)
                  .setLabel('Confirm RSVP')
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`schedule-rsvpCancel-${eventCode}`)
                  .setLabel('Cancel RSVP')
                  .setStyle(ButtonStyle.Danger),
              ]),
          ]
        };
        if (message.content) { payload.content = message.content; }
        await message.edit(payload);

        await updateScheduleBoard(interaction.client, interaction.guild);
        return interaction.followUp(
          `Event **${eventData.title || eventCode}** updated to <t:${Math.floor(newTimestamp/1000)}:F>`
        );
      }
    },
    {
      longDescription: 'Cancel an upcoming scheduled event. An event can only be cancelled by a moderator or by the ' +
        'user who scheduled it.',
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-cancel')
        .setDescription('Cancel your upcoming event.')
        .addStringOption((opt) => opt
          .setName('event-code')
          .setDescription('Six character code of the upcoming event you wish to cancel.')
          .setRequired(true))
        .setDMPermission(false),
      async execute(interaction) {
        const eventCode = interaction.options.getString('event-code');

        let sql = `SELECT se.id, se.channelId, se.messageId, se.threadId, se.schedulingUserId
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND se.eventCode=?
                     AND timestamp > ?`;
        const eventData = await dbQueryOne(sql, [
          interaction.guildId, eventCode.toUpperCase(), new Date().getTime(),
        ]);

        // If no event is found, notify the user
        if (!eventData) {
          return interaction.reply({
            content: 'There is no upcoming event with that code.',
            ephemeral: true,
          });
        }

        try {
          // This potentially causes several requests to be made, and may take a few seconds
          await interaction.deferReply({ ephemeral: true });

          // If the user is not a moderator and not the scheduling user, deny the cancellation
          if ((interaction.user.id !== eventData.schedulingUserId) && !await verifyModeratorRole(interaction.member)) {
            const schedulingUser = await interaction.guild.members.fetch(eventData.schedulingUserId);
            return interaction.followUp({
              content: 'This event can only be cancelled by the user who scheduled it ' +
                `(${schedulingUser.displayName}), or by an administrator.`,
              ephemeral: true,
            });
          }

          try{
            // The event is to be cancelled. Replace the schedule message with a cancellation notice
            const scheduleChannel = await interaction.guild.channels.fetch(eventData.channelId);
            const scheduleMsg = await scheduleChannel.messages.fetch(eventData.messageId);
            await scheduleMsg.edit({
              content: `This event has been cancelled by ${interaction.user}.`,
              embeds: [],
              components: [],
            });

            // Remove all reactions from the message
            await scheduleMsg.reactions.removeAll();

            // Close and lock the thread if one exists
            if (eventData.threadId) {
              const thread = await interaction.guild.channels.fetch(eventData.threadId);
              await thread.setLocked(true);
              await thread.setArchived(true);
            }
          } catch(err) {
            // Handle non-404 errors normally. If the error was a 404, it means the message was manually deleted
            // and no action is necessary
            if (err.status !== 404) { generalErrorHandler(err); }
          }

          // Remove the event's entry from the database
          await dbExecute('DELETE FROM scheduled_events WHERE id=?', [eventData.id]);

          await updateScheduleBoard(interaction.client, interaction.guild);
          return interaction.followUp(`Event with code ${eventCode.toUpperCase()} has been cancelled.`);
        } catch(e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the event could not be cancelled.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      longDescription: 'Create and pin a message containing an automatically updated list of scheduled events ' +
        'to this channel. The message will automatically update whenever an event is scheduled or cancelled, ' +
        'and will automatically remove past events once per hour.',
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-board-post')
        .setDescription('Post a schedule board in this channel.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        try {
          // This function may make a few requests, which could take a few seconds
          await interaction.deferReply({ ephemeral: true });

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
              return interaction.followUp({
                content: `This channel already has a schedule board, located here: \n${existingMessage.url}`,
                ephemeral: true,
              });
            }

            // Message object has been deleted. Remove its entry from schedule_boards
            await dbExecute('DELETE FROM schedule_boards WHERE id=?', [existingMessage.id]);
            await interaction.followUp({
              content: 'It appears a schedule board previously existed in this channel but was deleted without ' +
                'my knowledge (I blame Discord). A new schedule board is being created.',
              ephemeral: true,
            });
          }

          // Create schedule board message, pin it, add schedule_boards entry, update contents
          const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
          const scheduleBoardMessage = await interaction.channel.send('Fetching scheduled events. Please wait...');
          await scheduleBoardMessage.pin();
          sql = 'INSERT INTO schedule_boards (guildDataId, channelId, messageId) VALUES(?, ?, ?)';
          await dbExecute(sql, [guildData.id, interaction.channel.id, scheduleBoardMessage.id]);
          await updateScheduleBoard(interaction.client, interaction.guild);
          return interaction.followUp('Schedule board created.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the schedule board could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-board-delete')
        .setDescription('Delete a schedule board if it exists in this channel.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        // Check for existing schedule board in this channel
        let sql = `SELECT sb.id, sb.messageId
                   FROM schedule_boards sb
                   JOIN guild_data gd ON sb.guildDataId = gd.id
                   WHERE gd.guildId=?
                        AND sb.channelId=?`;
        const existingBoard = await dbQueryOne(sql, [interaction.guildId, interaction.channel.id]);
        if (!existingBoard) {
          return interaction.reply({
            content: 'No message board exists in this channel.',
            ephemeral: true,
          });
        }

        try {
          await interaction.deferReply({ ephemeral: true });

          // Delete schedule board message
          const board = await interaction.channel.messages.fetch(existingBoard.messageId);
          await board.delete();

          // Delete row from schedule_boards
          await dbExecute('DELETE FROM schedule_boards WHERE id=?', [existingBoard.id]);
          return interaction.followUp('Schedule board deleted.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the schedule board could not be deleted.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('schedule-option-threads')
        .setDescription('Enable or disable automatic thread creation for scheduled events.')
        .addBooleanOption((opt) => opt
          .setName('toggle' )
          .setDescription('True to enable, False to disable')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const toggle = interaction.options.getBoolean('toggle', true);

        // Fetch guild data
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          await interaction.followUp('Unable to complete request. An error was logged.');
          throw new Error(`Unable to find guildData entry for guild with id ${interaction.guild.id}`);
        }

        await dbExecute('UPDATE guild_options SET eventThreads=? WHERE guildDataId=?', [toggle ? 1 : 0, guildData.id]);
        return interaction.followUp(toggle ? 'Event threads enabled.' : 'Event threads disabled.');
      }
    },
  ],
};
