const { verifyModeratorRole, dbExecute, dbQueryOne } = require('../lib');

module.exports = async (client, message) => {
  // Do not respond to non-guild messages
  if (!message.guild) { return; }

  // Unless a moderator wants to close this report channel, do nothing
  if (message.content.trim() !== '.resolve') { return; }

  // If the user is not a moderator, inform them only moderators may chose the channel
  const guildMember = message.guild.members.resolve(message.author.id);
  if (!await verifyModeratorRole(guildMember)) {
    return message.channel.send('Only moderators may close this channel.');
  }

  // Fetch current channel entry data
  let sql = `SELECT mcc.id, mc.channelId
             FROM mod_contact_channels mcc
             JOIN mod_contact mc ON mcc.modContactId = mc.id
             JOIN guild_data gd ON mc.guildDataId = gd.id
             WHERE gd.guildId=?
                AND mcc.reportChannelId=?`;
  const modContact = await dbQueryOne(sql, [message.guild.id, message.channel.id]);

  // Prevent deletion of the mod-contact channel
  if (message.channel.id === modContact.channelId) { return; }

  // Update the mod_contact_channels table to show this report as resolved
  sql = `UPDATE mod_contact_channels SET resolved=1, resolutionTime=(UNIX_TIMESTAMP()) WHERE id=?`;
  await dbExecute(sql, [modContact.id]);

  // Delete the text channel
  return message.channel.delete();
};