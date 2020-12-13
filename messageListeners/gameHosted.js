const { supportedGames } = require('../assets/supportedGames.json');

module.exports = (client, message) => {
    const watchedUrls = [];
    Object.keys(supportedGames).forEach((game) => {
        watchedUrls.push(supportedGames[game].seedDownloadUrl);
    });

    for (let url of watchedUrls) {
        if (message.content.search(url) > -1) {
            // Ping the channel role to alert the seed has been generated
            const sql = `SELECT rsg.roleId AS roleId
                    FROM room_systems rs
                    JOIN room_system_games rsg ON rs.id = rsg.roomSystemId
                    JOIN guild_data gd ON rs.guildDataId=gd.id
                    WHERE gd.guildId=?
                      AND rsg.textChannelId=?`;
            return client.db.query(sql, [message.guild.id, message.channel.id], (err, roleData) => {
                if (err) { throw new Error(err); }
                if (roleData.length) {
                    message.channel.send(`${message.guild.roles.resolve(roleData[0].roleId)}: ` +
                        `The seeds have been posted!`);

                    // Pin the message to the channel
                    return message.pin();
                }
            });
        }
    }
};