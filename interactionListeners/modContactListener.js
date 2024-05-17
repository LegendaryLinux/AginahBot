const { modContactEnabled, modContactExists, createModContact } = require('../slashCommandCategories/modContact');
const { dbExecute } = require('../lib');

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

  // Check if the DB believes a mod-contact exists for this user already
  const existingChannelId = await modContactExists(interaction.guild, interaction.member);
  if (existingChannelId) {
    try {
      // Attempt to fetch this channel from the Discord API and inform the user a mod-contact already exists
      const existingChannel = await interaction.guild.channels.fetch(existingChannelId);
      await interaction.user.send(`You already have a mod-contact open here: ${existingChannel}`);

      // Inform Discord the interaction was handled, but do not change the original message
      return interaction.update({});
    } catch (e) {
      // The database claims this channel exists, but the Discord API disagrees. Set this mod contact as
      // resolved and allow the system to open a new one. This can happen if a mod-contact user channel
      // is manually deleted, or if Discord is just having a bad day
      let sql = `UPDATE mod_contact_channels
                 SET resolved=1, resolutionTime=UNIX_TIMESTAMP()
                 WHERE userId=?
                   AND reportChannelId=?`;
      await dbExecute(sql, [interaction.user.id, existingChannelId]);
    }
  }

  // Create the mod-contact channel
  await createModContact(interaction, interaction.member);

  // Inform Discord the interaction was handled, but do not change the original message
  return interaction.update({});
};