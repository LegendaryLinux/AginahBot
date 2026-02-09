const { verifyModeratorRole, buildControlMessagePayload, dbQueryAll, dbQueryOne, dbExecute, verifyChannelPermissions,
  formatPermissionList } = require('../lib');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, UserSelectMenuBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId eventRoom
  if (!interaction.hasOwnProperty('customId') || !interaction.customId.startsWith('eventRoom')) { return; }

  // Identify command
  const commandParts = interaction.customId.split('-');
  const command = commandParts[1];

  let sql;

  // Identify room owner id
  sql = `SELECT rs.id, rsc.id AS systemChannelId, rsc.ownerUserId, rsc.controlMessageId
         FROM room_system_channels rsc
         JOIN room_systems rs ON rsc.roomSystemId = rs.id
         JOIN guild_data gd ON rs.guildDataId = gd.id
         WHERE gd.guildId=?
            AND rsc.voiceChannelId=?`;
  const channelData = await dbQueryOne(sql, [interaction.guild.id, interaction.channel.id]);

  if (!channelData) {
    return interaction.reply({
      content: 'Unable to complete interaction.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Only the user who created the room or a moderator user may interact with the room commands
  if (interaction.member.id !== channelData.ownerUserId && !await verifyModeratorRole(interaction.member)) {
    return interaction.reply({
      content: 'Only the event room owner or a moderator can perform actions.',
      flags: MessageFlags.Ephemeral,
    });
  }

  switch (command) {
    case 'rename':
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`eventRoom-rename-${interaction.member.id}-${interaction.message.id}`)
          .setTitle('Rename Event Channel')
          .addComponents(...[
            new ActionRowBuilder().addComponents(...[
              new TextInputBuilder()
                .setCustomId('channelName')
                .setLabel('New Channel Name:')
                .setStyle(TextInputStyle.Short)
                .setMinLength(4)
                .setMaxLength(50)
                .setPlaceholder('My Very Cool Event')
                .setRequired(true),
            ])
          ])
      );

    case 'sendPing':
      let onlySelfSql = '';
      const params = [interaction.guild.id];

      if (!await verifyModeratorRole(interaction.member)) {
        onlySelfSql = 'AND se.schedulingUserId = ?';
        params.push(interaction.user.id);
      }

      sql = `SELECT se.eventCode, se.title
                 FROM scheduled_events se
                 JOIN guild_data gd ON se.guildDataId = gd.id
                 WHERE gd.guildId=?
                    AND se.timestamp >= (UNIX_TIMESTAMP() * 1000 - 7200000)
                    AND se.timestamp < (UNIX_TIMESTAMP() * 1000 + 7200000)
                    ${onlySelfSql}
                 ORDER BY se.timestamp
                 LIMIT 25`;

      const events = await dbQueryAll(sql, params);
      if (!events?.length) {
        return interaction.reply({
          content: 'No recently passed or soon upcoming events were found.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: 'Select an upcoming event to send a reminder ping to all RSVPed users:',
        components: [
          new ActionRowBuilder().addComponents(...[
            new StringSelectMenuBuilder()
              .setCustomId(`eventRoom-sendPing-${interaction.member.id}`)
              .setPlaceholder('Choose an event')
              .addOptions(...[events.map((e) => (
                new StringSelectMenuOptionBuilder()
                  .setLabel(`[${e.eventCode}] ${(e?.title || 'Unknown Event Name').substring(0, 91)}`)
                  .setValue(e.eventCode)
              ))])
          ]),
        ],
        flags: MessageFlags.Ephemeral,
      });

    case 'sendPingConfirm':
      const pingPermissions = verifyChannelPermissions(interaction.channel, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]);
      if (!pingPermissions.ok) {
        return interaction.reply({
          content: `Required permissions are missing for this action. (` +
            `${formatPermissionList(pingPermissions.missingPermissions)})`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const eventCode = commandParts[2];
      sql = `SELECT se.id, se.channelId, se.messageId, se.title
                 FROM scheduled_events se
                 JOIN guild_data gd ON se.guildDataId = gd.id
                 WHERE gd.guildId=? 
                    AND se.eventCode=?`;
      const event = await dbQueryOne(sql, [interaction.guild.id, eventCode]);
      if (!event) {
        return interaction.update({
          content: 'Unable to send event ping. Please contact an administrator.',
        });
      }

      const users = await dbQueryAll('SELECT userId FROM event_rsvp WHERE eventId=?', [event.id]);
      let reminderMessage = `# ${event.title || 'An event you RSVPed to'} \nAn event you RSVPed to is about to ` +
        'start in this channel!\n';
      users.forEach((user) => reminderMessage += `<@${user.userId}> `);
      await interaction.channel.send(reminderMessage);

      return interaction.update({
        content: 'Event ping sent.',
        components: [],
      });

    case 'transfer':
      return interaction.reply({
        content: 'Choose a new channel owner:',
        components: [
          new ActionRowBuilder().addComponents(...[
            new UserSelectMenuBuilder()
              .setCustomId(`eventRoom-transfer-${interaction.member.id}-${interaction.message.id}`),
          ]),
        ],
        flags: MessageFlags.Ephemeral,
      });

    case 'transferConfirm':
      const transferPermissions = verifyChannelPermissions(interaction.channel, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
      ]);
      if (!transferPermissions.ok) {
        return interaction.reply({
          content: `Required permissions are missing for this action. (` +
            `${formatPermissionList(transferPermissions.missingPermissions)})`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const newOwner = await interaction.guild.members.fetch(commandParts[2]);
      console.log(newOwner.id);

      // Set new room owner in DB
      await dbExecute(
        'UPDATE room_system_channels SET ownerUserId=? WHERE id=?',
        [newOwner.id, channelData.systemChannelId],
      );

      const controlMessage = await interaction.channel.messages.fetch(channelData.controlMessageId);
      await controlMessage.edit(buildControlMessagePayload(newOwner));

      await interaction.channel.send(`${newOwner} is now the channel owner.`);
      return interaction.update({
        content: `Ownership transferred to ${newOwner}`,
        components: [],
      });

    case 'close':
      const closePermissions = verifyChannelPermissions(interaction.channel, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
      ]);
      if (!closePermissions.ok) {
        return interaction.reply({
          content: `Required permissions are missing for this action. (` +
            `${formatPermissionList(closePermissions.missingPermissions)})`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.channel.setName(`${interaction.channel.name} (Closed)`);
      return interaction.reply({
        content: `${interaction.user} has closed the room.`,
        allowedMentions: {}
      });
  }
};
