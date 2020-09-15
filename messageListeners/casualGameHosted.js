module.exports = (client, message) => {
    if (message.content.search('berserkermulti.world/hosted') !== -1) {
        // Ping the channel role to alert the seed has been generated
        let sql = `SELECT IFNULL(cg.roleId, rg.roleId) AS roleId FROM game_categories gc
                    LEFT JOIN casual_games cg ON gc.id = cg.categoryId
                    LEFT JOIN race_games rg on gc.id = rg.categoryId
                    WHERE gc.guildId=?
                      AND (cg.textChannelId=? OR rg.textChannelId=?)`;
        client.db.get(sql, message.guild.id, message.channel.id, message.channel.id, (err, roleData) => {
            if (roleData) {
                message.channel.send(`${message.guild.roles.resolve(roleData.roleId)}: The seeds have been posted!`);

                // Pin the message to the channel
                return message.pin();
            }
        });
    }
};