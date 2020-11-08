const { getModeratorRole } = require('../lib');

module.exports = (client, message) => {
    if (!message.guild) { return; }

    const commands = ['.ready', '.unready', '.readycheck', '.close', '.lock', '.unlock'];
    if (commands.indexOf(message.content) === -1) { return; }

    let sql = `SELECT rsrc.id AS checkId, rsg.id AS gameId, rsg.voiceChannelId, rs.planningChannelId
                FROM room_system_ready_checks rsrc
                JOIN room_system_games rsg ON rsrc.gameId = rsg.id
                JOIN room_systems rs ON rsg.roomSystemId = rs.id
                JOIN guild_data gd ON rs.guildDataId = gd.id
                WHERE rsrc.playerId=?
                    AND rsg.textChannelId=?
                    AND gd.guildId=?`
    client.db.get(sql, message.author.id, message.channel.id, message.guild.id, (err, roomSystem) => {
        if (err) { throw new Error(err); }
        if (!roomSystem) { return; }

        switch(message.content) {
            // Player has indicated they are ready to begin
            case '.ready':
                return client.db.run(`UPDATE room_system_ready_checks SET readyState=1 WHERE id=?`, roomSystem.checkId);

            // Player has indicated they are no longer ready to begin
            case '.unready':
                return client.db.run(`UPDATE room_system_ready_checks SET readyState=0 WHERE id=?`, roomSystem.checkId);

            // Print a list of players who are and are not ready
            case '.readycheck':
                const ready = [];
                const notReady = [];

                // Find each player's ready state
                let sql = `SELECT playerTag, readyState FROM room_system_ready_checks WHERE gameId=?`;
                return client.db.each(sql, roomSystem.gameId, (err, player) => {
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

            // Lock a dynamic voice channel, preventing anyone except moderators from joining
            case '.lock':
                return message.guild.channels.resolve(roomSystem.voiceChannelId).overwritePermissions([
                    {
                        // @everyone may not join the voice channel
                        id: message.guild.id,
                        deny: [ 'CONNECT' ],
                    },
                    {
                        // Moderators should still have full access
                        id: getModeratorRole(message.guild).id,
                        allow: [ 'CONNECT' ],
                    },
                    {
                        // @AginahBot should be able to connect
                        id: client.user.id,
                        allow: [ 'CONNECT' ],
                    }
                ]);

            // Reopen a dynamic voice channel, allowing anyone to join
            case '.unlock':
                return message.guild.channels.resolve(roomSystem.voiceChannelId).overwritePermissions([]);

            case '.close':
                let voiceChannel = message.guild.channels.resolve(roomSystem.voiceChannelId);
                // Do not re-close an already closed channel
                if (voiceChannel.name.search(/ \(Closed\)$/g) > -1) { return; }
                message.guild.channels.resolve(roomSystem.planningChannelId)
                    .send(`${message.channel.name.replace(/\b\w/g, c => c.toUpperCase())} is now closed.`);
                return voiceChannel.edit({ name: `${voiceChannel.name.toString()} (Closed)` });
        }
    });
};