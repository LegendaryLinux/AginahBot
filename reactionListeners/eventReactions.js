const { dbQueryOne } = require('../lib');

module.exports = async (client, messageReaction, user, added) => {
  // If the reaction was removed, do nothing
  if (!added) { return; }

  // Do nothing if the user is a bot or the message is a DM
  if (user.bot || !messageReaction.message.guild) { return; }

  // Determine if this reaction is attached to an event message
  const sql = `SELECT threadId
               FROM scheduled_events se
               JOIN guild_data gd ON se.guildDataId = gd.id
               WHERE se.messageId=?`;
  const eventData = await dbQueryOne(sql, [messageReaction.message.id]);
  if (!eventData || !eventData.threadId) { return; }

  const thread = await messageReaction.message.guild.channels.fetch(eventData.threadId);
  thread.members.add(user.id);
};
