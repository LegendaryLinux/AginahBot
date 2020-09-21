module.exports = (client, messageReaction, user) => {
    // Do nothing if the user is a bot, the message is a DM, or the reaction was removed
    if (user.bot || !messageReaction.message.guild) { return; }

    // Make sure we are acting upon the proper reaction
    if (messageReaction.emoji.name !== '⚔') { return; }

    let sql = `SELECT sg.id
                FROM scheduled_games sg
                JOIN guild_data gd ON sg.guildDataId = gd.id
                WHERE gd.guildId = ?
                    AND sg.channelId = ?
                    AND sg.messageId = ?`;
    client.db.get(sql, messageReaction.message.guild.id, messageReaction.message.channel.id,
        messageReaction.message.id, (err, game) => {
        if (err) { throw new Error(err); }
        if (!game) { return }
        client.db.run(`UPDATE scheduled_games SET rsvpCount=? WHERE id=?`, (messageReaction.count - 1), game.id);
    });
};