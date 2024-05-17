const { dbQueryOne, dbExecute } = require('../lib');

// Clean up mod_contact_channels entries if a mod contact channel is deleted
module.exports = async (client, channel) => {
  let sql = `SELECT mcc.id
             FROM guild_data gd
             JOIN mod_contact mc ON gd.id = mc.guildDataId
             JOIN mod_contact_channels mcc ON mc.id = mcc.modContactId
             WHERE gd.guildId=?
                AND mcc.reportChannelId=?`;
  const reportChannel = await dbQueryOne(sql, [channel.guildId, channel.id]);
  if (!reportChannel) { return; }

  sql = 'UPDATE mod_contact_channels SET resolved=1, resolutionTime=UNIX_TIMESTAMP() WHERE id=?';
  await dbExecute(sql, [reportChannel.id]);
};
