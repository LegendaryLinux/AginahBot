module.exports = (client, message) => {
    if (message.content.search('berserkermulti.world/hosted') !== -1) {
        // Ping the channel role to alert the seed has been generated
        let sql = `SELECT rsg.roleId AS roleId
                    FROM room_systems rs
                    JOIN room_system_games rsg ON rs.id = rsg.roomSystemId
                    JOIN guild_data gd ON rs.guildDataId=gd.id
                    WHERE gd.guildId=?
                      AND rsg.textChannelId=?`;
        client.db.get(sql, message.guild.id, message.channel.id, message.channel.id, (err, roleData) => {
            if (err) { throw new Error(err); }
            if (roleData) {
                message.channel.send(`${message.guild.roles.resolve(roleData.roleId)}: The seeds have been posted!`);

                // Pin the message to the channel
                return message.pin();
            }
        });
    }
};