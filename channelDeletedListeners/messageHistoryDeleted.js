const { dbQueryOne, dbExecute } = require('../lib');

// Clean up the database if the message history channel is deleted
module.exports = async (client, channel) => {
  // Determine if the deleted channel was a message-history channel
  const sql = `SELECT go.id, go.messageHistoryChannelId
               FROM guild_options go
               JOIN guild_data gd ON go.guildDataId = gd.id
               WHERE gd.guildId=?
                 AND go.messageHistoryChannelId=?`;
  const options = await dbQueryOne(sql, [channel.guild.id, channel.id]);
  if (!options?.messageHistoryChannelId) {
    return;
  }

  // Delete database entry
  await dbExecute('UPDATE guild_options SET messageHistoryChannelId=NULL WHERE id=?', [options.id]);
};
