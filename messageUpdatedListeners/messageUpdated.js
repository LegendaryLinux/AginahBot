const { dbQueryOne} = require('../lib');
const tmp = require('tmp');
const fs = require('fs');
const Discord = require('discord.js');

// Delete DB entries if role messages are deleted
module.exports = async (client, oldMessage, newMessage) => {
  let sql = `SELECT go.id, go.messageHistoryChannelId
             FROM guild_options go
             JOIN guild_data gd ON go.guildDataId = gd.id
             WHERE gd.guildId=?`;
  const options = await dbQueryOne(sql, [newMessage.guild.id]);

  // Do nothing if this guild does not have a message history channel
  // Do nothing if the message was deleted from a message history channel
  if (!options?.messageHistoryChannelId || newMessage.channel.id === options.messageHistoryChannelId) {
    return;
  }

  const messageHistoryChannel = await newMessage.guild.channels.fetch(options.messageHistoryChannelId);
  const embed = new Discord.EmbedBuilder()
    .setTitle('Message Updated')
    .setColor('#285fec')
    .setTimestamp(new Date())
    .addFields(
      { name: 'Channel Name', value: `${newMessage.channel} (${newMessage.channel.name})`, inline: true },
      { name: ' ', value: ' ', inline: true },
      { name: 'Message', value: newMessage.url, inline: true },

      {
        name: 'Author',
        value: `${newMessage.author} (${newMessage.author.username})`,
        inline: true,
      },
      { name: ' ', value: ' ', inline: true },
      { name: 'Author ID', value: newMessage.member.id, inline: true },
    );

  const files = [];

  let oldMessageFile = null;
  if (oldMessage.content.length > 1024) {
    oldMessageFile = tmp.fileSync({ mode: 0o644, postfix: '.txt' });
    fs.writeFileSync(oldMessageFile.name, oldMessage.content);
    files.push({
      attachment: oldMessageFile.name,
      name: 'old-full-message-text.txt'
    });
    embed.addFields([
      {
        name: 'Old Message Content',
        value: 'Content exceeded 1024 characters. See attached text log.',
        inline: false,
      },
    ]);
  } else {
    embed.addFields([
      {
        name: 'Old Message Content',
        value: (oldMessage.content || 'Message had no content.').substring(0, 1024),
        inline: false,
      }
    ]);
  }

  let newMessageFile = null;
  if (newMessage.content.length > 1024) {
    newMessageFile = tmp.fileSync({ mode: 0o644, postfix: '.txt' });
    fs.writeFileSync(newMessageFile.name, newMessage.content);
    files.push({
      attachment: newMessageFile.name,
      name: 'new-full-message-text.txt'
    });
    embed.addFields([
      {
        name: 'New Message Content',
        value: 'Content exceeded 1024 characters. See attached text log.',
        inline: false,
      },
    ]);
  } else {
    embed.addFields([
      {
        name: 'New Message Content',
        value: (newMessage.content || 'Message had no content.').substring(0, 1024),
        inline: false,
      }
    ]);
  }

  const oldAttachments = Array.from(oldMessage.attachments).map((a) => a[1].url);
  const newAttachments = Array.from(newMessage.attachments).map((a) => a[1].url);
  const deletedAttachments = oldAttachments.filter((a) => !newAttachments.includes(a));
  files.push(...deletedAttachments);

  embed.addFields([
    { name: 'Deleted Attachments', value: deletedAttachments.length.toString(), inline: false },
  ]);

  const messagePayload = {
    embeds: [embed],
    allowedMentions: {},
  };

  if (files.length > 0) {
    messagePayload.files = files;
  }

  await messageHistoryChannel.send(messagePayload);

  if (oldMessageFile) { oldMessageFile.removeCallback(); }
  if (newMessageFile) { newMessageFile.removeCallback(); }
};
