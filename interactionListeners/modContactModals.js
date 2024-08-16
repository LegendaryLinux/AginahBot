const { createModContact } = require('../slashCommandCategories/modContact');

module.exports = async (client, interaction) => {
  // Only listen for modal submissions
  if (!interaction.isModalSubmit()) { return; }

  // Only listen for the target interaction having customId eventRoom
  if (!interaction.hasOwnProperty('customId') || interaction.customId !== 'mod-contact-modal') { return; }

  const initialMessage = interaction.fields.getTextInputValue('details');

  const modContactChannel = await createModContact(interaction, interaction.member, initialMessage);

  return interaction.reply({
    content: `Mod contact channel opened: ${modContactChannel}`,
    ephemeral: true,
  });
};
