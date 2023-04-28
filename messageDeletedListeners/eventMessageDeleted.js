const { dbQueryOne, dbExecute } = require('../lib');

// Delete DB entries if event messages are deleted
module.exports = async (client, message) => {
  let sql = `SELECT se.id
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.guildId
             WHERE gd.guildId=?
                AND se.messageId=?`;
  const eventMessage = await dbQueryOne(sql, [message.guild.id, message.id]);

  // If there is no role_messages entry found, do nothing
  if (!eventMessage) { return; }

  await dbExecute('DELETE FROM scheduled_events WHERE id=?', [eventMessage.id]);
};