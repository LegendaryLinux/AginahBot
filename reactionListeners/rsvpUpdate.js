const { dbQueryOne, dbExecute } = require('../lib');

module.exports = async (client, messageReaction, user, added) => {
  // Do nothing if the user is a bot, the message is a DM, or the reaction was removed
  if (user.bot || !messageReaction.message.guild) { return; }

  // Make sure we are acting upon the proper reaction
  if (messageReaction.emoji.name === '⚔' || messageReaction.emoji.name === '🐔') {
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

    // Reaction was added, so add user to event_attendees table
    if (added) {
      let sql = `REPLACE INTO event_attendees (eventId, userId) VALUES (?, ?)`;
      return dbExecute(sql, [evt.id, user.id]);
    }

    // Reaction was removed, so remove user from event_attendees table
    if (!added) {
      let sql = `DELETE FROM event_attendees WHERE eventId=? AND userId=?`;
      return dbExecute(sql, [evt.id, user.id]);
    }
  }
};