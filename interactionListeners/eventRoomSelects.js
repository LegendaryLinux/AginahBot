const { verifyModeratorRole } = require('../lib');
const {ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');

module.exports = async (client, interaction) => {
  // Only listen for modal submissions
  if (
    !interaction.isUserSelectMenu() &&
    !interaction.isStringSelectMenu()
  ) { return; }

  // Only listen for the target interaction having customId eventRoom
  if (!interaction.hasOwnProperty('customId') || !interaction.customId.startsWith('eventRoom')) { return; }

  // Identify command
  const commandParts = interaction.customId.split('-');
  const command = commandParts[1];
  const controlMessageId = commandParts[3];

  // Only the user who created the room or a moderator user may interact with the room commands
  if (interaction.member.id !== commandParts[2] && !await verifyModeratorRole(interaction.member)) {
    return interaction.reply({
      content: 'Only the event room owner or a moderator can perform actions.',
      ephemeral: true,
    });
  }

  switch (command) {
    case 'sendPing':
      const eventCode = interaction.values[0];

      return interaction.update({
        content: `Are you sure you want to ping all RSVPed members for \`[${eventCode}]\`?` +
          '_Remember, with great power comes great responsibility._',
        components: [
          new ActionRowBuilder()
            .addComponents(...[
              new ButtonBuilder()
                .setCustomId(`eventRoom-sendPingConfirm-${interaction.member.id}-${eventCode}`)
                .setLabel('Confirm Ping')
                .setStyle(ButtonStyle.Danger)
            ])
        ],
      });

    case 'transfer':
      const newOwner = await interaction.guild.members.fetch(interaction.values[0]);
      return interaction.update({
        content: `Are you sure you want to transfer channel ownership to ${newOwner}?`,
        components: [
          new ActionRowBuilder()
            .addComponents(...[
              new ButtonBuilder()
                .setCustomId(`eventRoom-transferConfirm-${interaction.member.id}-${newOwner.id}-${controlMessageId}`)
                .setLabel('Confirm Transfer')
                .setStyle(ButtonStyle.Danger)
            ]),
        ],
        ephemeral: true,
      });

    default:
      return interaction.reply({
        content: 'Unknown eventRoomModal interaction. Please contact an administrator.',
        ephemeral: true,
      });
  }
};
