const { dbQueryAll} = require('../lib');

module.exports = async (client, message) => {
  const matches = message.content.match(/&\w+\s?/g);

  // If there are no tags in this message, do nothing
  if (!matches) { return; }

  // Remove the & and trim each tag. Also build part of the SQL query string
  const messageTags = [];
  let inString = '';
  matches.forEach((tag) => {
    messageTags.push(tag.substring(1).trim());
    inString += '?,';
  });
  inString = inString.slice(0, -1);

  // Fetch the tag messages from the database
  let sql = `SELECT mt.tagContent
             FROM message_tags mt
             JOIN guild_data gd ON mt.guildDataId = gd.id
             WHERE gd.guildId=?
                AND mt.tagName IN (${inString})`;
  const rows = await dbQueryAll(sql, [message.guild.id, ...messageTags]);

  // Send each tag message to the channel in a separate message
  for (let row of rows) {
    await message.channel.send(row.tagContent);
  }
};