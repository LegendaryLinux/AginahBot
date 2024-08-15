const { verifyModeratorRole, buildControlMessagePayload, dbQueryAll, dbQueryOne } = require('../lib');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  UserSelectMenuBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId eventRoom
  if (!interaction.hasOwnProperty('customId') || !interaction.customId.startsWith('eventRoom')) { return; }

  // Identify command
  const commandParts = interaction.customId.split('-');
  const command = commandParts[1];

  // Only the user who created the room or a moderator user may interact with the room commands
  if (interaction.member.id !== commandParts[2] && !await verifyModeratorRole(interaction.member)) {
    return interaction.reply({
      content: 'Only the event room owner or a moderator can perform actions.',
      ephemeral: true,
    });
  }

  let sql;

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
      sql = `SELECT se.eventCode, se.title
                 FROM scheduled_events se
                 JOIN guild_data gd ON se.guildDataId = gd.id
                 WHERE gd.guildId=? 
                    AND se.timestamp >= (UNIX_TIMESTAMP() * 1000 - 7200000)
                    AND se.timestamp < (UNIX_TIMESTAMP() * 1000 + 7200000)
                 ORDER BY se.timestamp
                 LIMIT 25`;
      const events = await dbQueryAll(sql, [interaction.guild.id]);
      if (!events?.length) {
        return interaction.reply({
          content: 'No recently passed or soon upcoming events were found.',
          ephemeral: true,
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
                  .setLabel(`[${e.eventCode}] ${e.title}`)
                  .setValue(e.eventCode)
              ))])
          ]),
        ],
        ephemeral: true,
      });

    case 'sendPingConfirm':
      const eventCode = commandParts[3];
      sql = `SELECT se.channelId, se.messageId, se.title
                 FROM scheduled_events se
                 JOIN guild_data gd ON se.guildDataId = gd.id
                 WHERE gd.guildId=? 
                    AND se.eventCode=?`;
      const event = await dbQueryOne(sql, [interaction.guild.id, eventCode]);
      if (!event) {
        return interaction.update({
          content: 'Unable to send event ping. Please contact an administrator.',
          ephemeral: true,
        });
      }

      const channel = await interaction.guild.channels.fetch(event.channelId);
      const message = await channel.messages.fetch(event.messageId);
      const userIds = [];
      message.reactions.cache.each((reaction) => {
        reaction.users.cache.each((user) => {
          if (user.id !== client.user.id && !userIds.includes(user.id)) {
            userIds.push(user.id);
          }
        });
      });

      let reminderMessage = `# ${event.title || 'An event you RSVPed to'} \nAn event you RSVPed to is about to ` +
        'start in this channel!\n';
      userIds.forEach((userId) => reminderMessage += `<@${userId}> `);
      await interaction.channel.send(reminderMessage);

      return interaction.update({
        content: 'Event ping sent.',
        components: [],
        ephemeral: true,
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
        ephemeral: true,
      });

    case 'transferConfirm':
      const newOwner = await interaction.guild.members.fetch(commandParts[3]);
      const controlMessage = await interaction.channel.messages.fetch(commandParts[4]);
      await controlMessage.edit(buildControlMessagePayload(newOwner));

      await interaction.channel.send(`${newOwner} is now the channel owner.`);
      return interaction.update({
        content: `Ownership transferred to ${newOwner}`,
        components: [],
        ephemeral: true,
      });
  }
};
