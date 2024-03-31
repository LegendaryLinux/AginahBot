const { modContactEnabled, modContactExists, createModContact } = require('../slashCommandCategories/modContact');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId mod-contact
  if (!interaction.hasOwnProperty('customId') || interaction.customId !== 'mod-contact') { return; }

  if (!await modContactEnabled(interaction.guild)) {
    await interaction.user.send('Something went wrong and a mod-contact could not be created.');

    // Inform Discord the interaction was handled, but do not change the original message
    return interaction.update({});
  }

  // Inform the user if a mod-contact already exists
  const existingChannelId = await modContactExists(interaction.guild, interaction.member);
  if (existingChannelId) {
    const existingChannel = await interaction.guild.channels.fetch(existingChannelId);
    await interaction.user.send(`You already have a mod-contact open here: ${existingChannel}`);

    // Inform Discord the interaction was handled, but do not change the original message
    return interaction.update({});
  }

  // Create the mod-contact channel
  await createModContact(interaction, interaction.member);

  // Inform Discord the interaction was handled, but do not change the original message
  return interaction.update({});
};