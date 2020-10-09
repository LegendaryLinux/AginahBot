module.exports = (client, message) => {
    if (!message.guild) { return; }

    const commands = ['.ready', '.unready', '.readycheck'];
    if (commands.indexOf(message.content) === -1) { return; }

    let sql = `SELECT crc.id
                FROM casual_ready_checks crc
                JOIN casual_games cg ON crc.gameId = cg.id
                JOIN game_categories gc ON cg.categoryId = gc.id
                JOIN guild_data gd ON gc.guildDataId = gd.id
                WHERE crc.playerId=?
                    AND cg.textChannelId=?
                    AND gd.guildId=?`
    client.db.get(sql, message.author.id, message.channel.id, message.guild.id, (err, readyCheck) => {
        if (err) { throw new Error(err); }
        if (!readyCheck) { return; }

        switch(message.content) {
            case '.ready':
                return client.db.run(`UPDATE casual_ready_checks SET readyState=1 WHERE id=?`, readyCheck.id);

            case '.unready':
                return client.db.run(`UPDATE casual_ready_checks SET readyState=0 WHERE id=?`, readyCheck.id);

            case '.readycheck':
                const ready = [];
                const notReady = [];

                // Find each player's ready state
                let sql = `SELECT playerTag, readyState FROM casual_ready_checks WHERE id=?`;
                client.db.each(sql, readyCheck.id, (err, player) => {
                    if (err) { throw new Error(err); }
                    if (parseInt(player.readyState, 10) === 1) {
                        ready.push(player.playerTag);
                    } else {
                        notReady.push(player.playerTag);
                    }
                }, () => {
                    const output = ['**Ready:**'];
                    ready.length === 0 ?
                        output.push('🏜 No players are ready yet.') :
                        ready.forEach((player) => output.push(player));

                    output.push('');// Add a blank line between ready and not-ready players

                    output.push('**Not ready:**')
                    notReady.length === 0 ?
                        output.push('🏁 All players are ready!') :
                        notReady.forEach((player) => output.push(player));

                    return message.channel.send(output);
                });
        }
    });
};