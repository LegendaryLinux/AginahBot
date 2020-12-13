module.exports = (client, messageReaction, user, added) => {
    // Do nothing if the user is a bot, the message is a DM, or the reaction was removed
    if (user.bot || !messageReaction.message.guild) { return; }

    // Make sure we are acting upon the proper reaction
    if (messageReaction.emoji.name === '⚔') {
        // Identify the event this reaction is associated with
        let sql = `SELECT se.id
                   FROM scheduled_events se
                   JOIN guild_data gd ON se.guildDataId = gd.id
                        WHERE gd.guildId = ?
                        AND se.channelId = ?
                        AND se.messageId = ?`;
        client.db.query(sql,
            [messageReaction.message.guild.id, messageReaction.message.channel.id, messageReaction.message.id],
            (err, evt) => {
                if (err) { throw new Error(err); }
                evt = evt[0];

                // Reaction was added, so add user to event_attendees table
                if (added) {
                    let sql = `INSERT INTO event_attendees (eventId, userId) VALUES (?, ?)`;
                    return client.db.execute(sql, [evt.id, user.id]);
                }

                // Reaction was removed, so remove user from event_attendees table
                if (!added) {
                    let sql = `DELETE FROM event_attendees WHERE eventId=? AND userId=?`;
                    return client.db.execute(sql, [evt.id, user.id]);
                }
            }
        );
    }
};