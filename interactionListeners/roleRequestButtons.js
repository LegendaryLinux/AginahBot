const { MessageFlags } = require('discord.js');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId role-request||roleId
  if (!interaction?.customId?.startsWith('role-request||')) { return; }

  const roleId = interaction.customId.split('||')[1];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let content;
  try{
    // Fetch the role from this guild
    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) { throw new Error(`Role ${roleId} could not be found.`); }

    // Grant the role if the user does not have it
    if (!interaction.member.roles.cache.has(roleId)) {
      await interaction.member.roles.add(role);
      content = `Granted role: ${role}`;
    } else {
      // Remove the role if the user has it already
      await interaction.member.roles.remove(role);
      content = `Removed role: ${role}`;
    }
  } catch (e) {
    console.error(e);
    content = 'Something went wrong and your roles could not be updated.\n' +
      'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)';
  }

  return interaction.editReply({ content });
};
