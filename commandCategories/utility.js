const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { parseTimeString } = require('../lib');
const { generalErrorHandler } = require('../errorHandlers');
const tmp = require('tmp');
const fs = require('fs');

const sendTimestampMessage = async (interaction, targetDate) => {
  const embed = new EmbedBuilder()
    .setTitle(`<t:${Math.floor(targetDate.getTime() / 1000)}:F>`)
    .setColor('#6081cb')
    .addFields(
      { name: 'Javascript / Node.js Timestamp', value: targetDate.getTime().toString() },
      { name: 'UNIX Timestamp', value: Math.floor(targetDate.getTime() / 1000).toString() },
    );
  return interaction.reply({ embeds: [embed] });
};

module.exports = {
  category: 'Utility Commands',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('timestamp')
        .setDescription('Enter a date/time to determine its unix timestamp')
        .addStringOption((opt) => opt
          .setName('dateTime')
          .setDescription('Allowed date/times look like:\n\n' +
            '`X:00`: The next occurrence of the provided minutes value\n' +
            '`X+2:15` A set number of hours in the future, at the provided minute value\n' +
            '`HH:MM TZ`: The next occurrence of the provided time.\n' +
            '`MM/DD/YYYY HH:MM TZ`: The specific provided date and time.\n' +
            '`YYYY-MM-DD HH:MM TZ`: The specific provided date and time.\n\n' +
            'Strict ISO-8601 formatted datetime values are allowed.\n' +
            'UNIX Timestamps are allowed.\n' +
            'A list of timezones can be found on the Wikipedia timezone page under the `TZ database name` column.\n' +
            'https://en.wikipedia.org/wiki/List_of_tz_database_time_zones')
          .setRequired(true))
        .setDMPermission(true),
      async execute(interaction) {
        const timeString = interaction.options.getString('dateTime').toUpperCase().trim();

        try{
          const targetDate = parseTimeString(timeString);
          return sendTimestampMessage(interaction, targetDate);
        } catch (error) {
          if (error.name && error.name === 'TimeParserValidationError') {
            return interaction.reply(error.message);
          }
          generalErrorHandler(error);
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('saveLog')
        .setDescription('Save a log of recent channel messages to a text file.')
        .addIntegerOption((opt) => opt
          .setName('limit')
          .setDescription('Number of messages to save. Min 1, max 1000, default 100')
          .setRequired(false))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const limit = interaction.options.getInteger('limit') ?? 100;

        // Control variables
        const logs = [];
        let lastMessageId = interaction.id;

        // Do not fetch more than 1000 messages from the Discord API
        if (limit < 1 || limit > 1000) {
          return interaction.reply({
            content: 'Limit argument must be an integer from 1 to 1000.',
            ephemeral: true,
          });
        }

        while (logs.length < limit) {
          // Determine number of messages to be fetched this request
          const fetchLimit = ((limit - logs.length) > 100) ? 100 : (limit - logs.length);

          // Fetch messages from Discord API
          const messages = await interaction.channel.messages.fetch({
            before: lastMessageId,
            limit: fetchLimit,
          });

          // Save relevant message data
          messages.each((msg) => {
            logs.push({
              id: msg.id,
              user: `${msg.author.username}#${msg.author.discriminator}`,
              timestamp: msg.createdTimestamp,
              content: msg.content,
            });
          });

          // Begin fetching from the earliest message
          lastMessageId = logs[logs.length - 1].id;

          // If no more messages are available, stop fetching
          if (messages.size <= fetchLimit) { break; }
        }

        // Reverse the array so the oldest messages accessed first, and will therefore be printed earlier
        // in the output file
        logs.reverse();

        // Build output file
        let output = '';
        logs.forEach((log) => {
          output += `${log.user} (${new Date(log.timestamp).toUTCString()}):\n${log.content}\n\n`;
        });

        // Save the output to a temporary file and send it to the channel
        return tmp.file((err, tmpFilePath, fd, cleanupCallback) => {
          fs.writeFile(tmpFilePath, output, () => {
            return interaction.reply({
              ephemeral: true,
              content: `Saved a log of the previous ${limit} messages in this channel.`,
              files: [
                {
                  name: `${interaction.channel.name}-log.txt`,
                  attachment: tmpFilePath,
                }
              ]
            });
          });
        });
      }
    },
  ],
};
