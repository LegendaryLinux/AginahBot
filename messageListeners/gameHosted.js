const { dbQueryOne } = require('../lib');

module.exports = async (client, message) => {
  const watchedUrls = [
    'https://archipelago.gg/room',
  ];

  for (let url of watchedUrls) {
    if (message.content.search(url) > -1) {
      // Ping the channel role to alert the seed has been generated
      const sql = `SELECT rsg.roleId AS roleId
                   FROM room_systems rs
                   JOIN room_system_games rsg ON rs.id = rsg.roomSystemId
                   JOIN guild_data gd ON rs.guildDataId=gd.id
                   WHERE gd.guildId=?
                     AND rsg.textChannelId=?`;
      const roleData = await dbQueryOne(sql, [message.guild.id, message.channel.id]);
      if (roleData) {
        message.channel.send(`${message.guild.roles.resolve(roleData.roleId)}: The seeds have been posted!`);

        // Pin the message to the channel
        return message.pin();
      }
    }
  }
};