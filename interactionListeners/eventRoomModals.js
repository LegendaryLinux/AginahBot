const { verifyModeratorRole } = require('../lib');
const { MessageFlags } = require('discord.js');

module.exports = async (client, interaction) => {
  // Only listen for modal submissions
  if (!interaction.isModalSubmit()) { return; }

  // Only listen for the target interaction having customId eventRoom
  if (!interaction.hasOwnProperty('customId') || !interaction.customId.startsWith('eventRoom')) { return; }

  // Identify command
  const commandParts = interaction.customId.split('-');
  const command = commandParts[1];

  // Only the user who created the room or a moderator user may interact with the room commands
  if (interaction.member.id !== commandParts[2] && !await verifyModeratorRole(interaction.member)) {
    return interaction.reply({
      content: 'Only the event room owner or a moderator can perform actions.',
      flags: MessageFlags.Ephemeral,
    });
  }

  switch (command) {
    case 'rename':
      const channelName = interaction.fields.getTextInputValue('channelName');
      await interaction.channel.setName(channelName);
      return interaction.reply({
        content: `Channel name updated to ${channelName}.`,
        flags: MessageFlags.Ephemeral,
      });

    default:
      return interaction.reply({
        content: 'Unknown eventRoomModal interaction. Please contact an administrator.',
        flags: MessageFlags.Ephemeral,
      });
  }
};
