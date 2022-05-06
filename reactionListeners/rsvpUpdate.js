const { dbQueryOne, dbExecute } = require('../lib');

module.exports = async (client, messageReaction, user, added) => {
  // Do nothing if the user is a bot, or the message is a DM
  if (user.bot || !messageReaction.message.guild) { return; }

  // Identify the event this reaction is associated with
  let sql = `SELECT se.id
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                        WHERE gd.guildId = ?
                        AND se.channelId = ?
                        AND se.messageId = ?`;
  const evt = await dbQueryOne(sql, [
    messageReaction.message.guild.id,
    messageReaction.message.channel.id,
    messageReaction.message.id,
  ]);
  if (!evt) { return; }

  // Reaction was added to a scheduling message, so add user to event_attendees table
  if (added) {
    let sql = `REPLACE INTO event_attendees (eventId, userId) VALUES (?, ?)`;
    return dbExecute(sql, [evt.id, user.id]);
  }

  // Reaction was removed, so remove user from event_attendees table
  if (!added) {
    let sql = `DELETE FROM event_attendees WHERE eventId=? AND userId=?`;
    return dbExecute(sql, [evt.id, user.id]);
  }
};