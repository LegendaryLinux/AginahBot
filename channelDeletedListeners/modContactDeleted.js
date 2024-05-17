const { dbQueryOne, dbQueryAll, dbExecute } = require('../lib');

// Clean up mod_contact if the #mod-contact channel or its category is deleted
module.exports = async (client, channel) => {
  let sql = `SELECT mc.id, mc.channelId, mc.categoryId
             FROM guild_data gd
             JOIN mod_contact mc ON gd.id = mc.guildDataId
             WHERE gd.guildId=?
                AND (mc.categoryId=? OR mc.channelId=?)`;
  const modContact = await dbQueryOne(sql, [channel.guildId, channel.id, channel.id]);
  if (!modContact) { return; }

  sql = 'SELECT reportChannelId FROM mod_contact_channels WHERE modContactId=?';
  const reportChannels = await dbQueryAll(sql, [modContact.id]);

  // Clean the database to prevent acting on modContactReportChannelDeleted events
  await dbExecute('DELETE FROM mod_contact_channels WHERE modContactId=?', [modContact.id]);
  await dbExecute('DELETE FROM mod_contact WHERE id=?', [modContact.id]);

  try {
    const guild = await channel.guild.fetch();

    try {
      const categoryChannel = await guild.channels.fetch(modContact.categoryId);
      await categoryChannel.delete();
    } catch (e) {
      // This channel might not exist, so ignore any problems if it can't be deleted
    }

    try {
      const modContactChannel = await guild.channels.fetch(modContact.channelId);
      await modContactChannel.delete();
    } catch (e) {
      // This channel might not exist, so ignore any problems if it can't be deleted
    }

    for (let reportChannel of reportChannels) {
      try {
        const targetChannel = await guild.channels.fetch(reportChannel.reportChannelId);
        await targetChannel.delete();
      } catch (e) {
        // This channel might not exist, so ignore any problems if it can't be deleted
      }
    }

  } catch (e) {
    console.log('Hi, mom!');
    console.error(e);
  }
};
