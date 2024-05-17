const { dbQueryOne, dbExecute } = require('../lib');

// Delete DB entries if role messages are deleted
module.exports = async (client, message) => {
  let sql = `SELECT rm.id
             FROM role_messages rm
             JOIN guild_data gd ON rm.guildDataId = gd.id
             WHERE gd.guildId=?
                AND rm.channelId=?
                AND rm.messageId=?`;
  const roleMessage = await dbQueryOne(sql, [message.guild.id, message.channel.id, message.id]);

  // If there is no role_messages entry found, do nothing
  if (!roleMessage) { return; }

  await dbExecute('DELETE FROM role_messages WHERE id=?', [roleMessage.id]);
};
