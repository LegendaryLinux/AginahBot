const { dbQueryOne } = require('../lib');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId mod-contact
  if (!interaction.hasOwnProperty('customId') || interaction.customId !== 'role-message-request') { return; }

  // Lookup the roleId for this message
  let sql = `SELECT rm.roleId
             FROM role_messages rm
             JOIN guild_data gd ON rm.guildDataId = gd.id
             WHERE gd.guildId=?
                AND rm.channelId=?
                AND rm.messageId=?`;
  const roleMessage = await dbQueryOne(sql, [interaction.guild.id, interaction.channel.id, interaction.message.id]);
  if (!roleMessage) {
    return interaction.user.send('Oops! Looks like this role button is broken. You should tell an admin.');
  }

  // Fetch role and grant to the user
  const role = await interaction.guild.roles.fetch(roleMessage.roleId);
  await interaction.member.roles.add(role);

  // Inform Discord the interaction was handled, but do not change the original message
  return interaction.update({});
};