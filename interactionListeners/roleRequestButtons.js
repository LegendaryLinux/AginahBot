module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId role-request||roleId
  if (!interaction?.customId?.startsWith('role-request||')) { return; }

  const roleId = interaction.customId.split('||')[1];

  try{
    // Fetch the role from this guild
    const role = await interaction.guild.roles.fetch(roleId);

    // Grant the role if the user does not have it
    if (!interaction.member.roles.cache.has(roleId)) {
      await interaction.member.roles.add(role);
      return interaction.reply({
        ephemeral: true,
        content: `Granted role: ${role}`,
      });
    } else {
      // Remove the role if the user has it already
      await interaction.member.roles.remove(role);
      return interaction.reply({
        ephemeral: true,
        content: `Removed role: ${role}`,
      });
    }
  } catch (e) {
    return interaction.reply({
      ephemeral: true,
      content: 'Something went wrong and your roles could not be updated.\n' +
        'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)',
    });
  }
};