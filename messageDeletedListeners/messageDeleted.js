const { dbQueryOne} = require('../lib');
const tmp = require('tmp');
const fs = require('fs');
const Discord = require('discord.js');

// Delete DB entries if role messages are deleted
module.exports = async (client, message) => {
  let sql = `SELECT go.id, go.messageHistoryChannelId
             FROM guild_options go
             JOIN guild_data gd ON go.guildDataId = gd.id
             WHERE gd.guildId=?`;
  const options = await dbQueryOne(sql, [message.guild.id]);

  // Do nothing if this guild does not have a message history channel
  // Do nothing if the message was deleted from a message history channel
  if (!options?.messageHistoryChannelId || message.channel.id === options.messageHistoryChannelId) {
    return;
  }

  const messageHistoryChannel = await message.guild.channels.fetch(options.messageHistoryChannelId);
  const embed = new Discord.EmbedBuilder()
    .setTitle('Message Deleted')
    .setColor('#e60000')
    .setTimestamp(new Date())
    .addFields(
      { name: 'Channel Name', value: `${message.channel} (${message.channel.name})`, inline: true },
      { name: ' ', value: ' ', inline: true },
      { name: 'Message ID', value: message.id, inline: true },

      {
        name: 'Author',
        value: `${message.author} (${message.author.username})`,
        inline: true,
      },
      { name: ' ', value: ' ', inline: true },
      { name: 'Author ID', value: message.member.id, inline: true },
    );

  const files = [];
  files.push(...Array.from(message.attachments).map((a) => a[1].url));

  let tmpFile = null;
  if (message.content.length > 1024) {
    tmpFile = tmp.fileSync({ mode: 0o644, postfix: '.txt' });
    fs.writeFileSync(tmpFile.name, message.content);
    files.push({
      attachment: tmpFile.name,
      name: 'full-message-text.txt'
    });
    embed.addFields([
      { name: 'Message Content', value: 'Content exceeded 1024 characters. See attached text log.', inline: false, },
    ]);
  } else {
    embed.addFields([
      {
        name: 'Message Content',
        value: (message.content || 'Message had no content.').substring(0, 1024),
        inline: false,
      }
    ]);
  }

  const messagePayload = {
    embeds: [embed],
    allowedMentions: {},
  };

  if (files.length > 0) {
    messagePayload.files = files;
  }

  await messageHistoryChannel.send(messagePayload);

  if (tmpFile) {
    tmpFile.removeCallback();
  }
};
