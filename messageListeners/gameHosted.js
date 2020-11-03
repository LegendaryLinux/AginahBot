const { supportedGames } = require('../assets/supportedGames.json');

module.exports = (client, message) => {
    for (let game of Object.entries(supportedGames)) {
        if (message.content.search(game.seedDownloadUrl) !== -1) {
            // Ping the channel role to alert the seed has been generated
            const sql = `SELECT rsg.roleId AS roleId
                    FROM room_systems rs
                    JOIN room_system_games rsg ON rs.id = rsg.roomSystemId
                    JOIN guild_data gd ON rs.guildDataId=gd.id
                    WHERE gd.guildId=?
                      AND rsg.textChannelId=?`;
            return client.db.get(sql, message.guild.id, message.channel.id, (err, roleData) => {
                if (err) { throw new Error(err); }
                if (roleData) {
                    message.channel.send(`${message.guild.roles.resolve(roleData.roleId)}: ` +
                        `The seeds have been posted!`);

                    // Pin the message to the channel
                    return message.pin();
                }
            });
        }
    }
};