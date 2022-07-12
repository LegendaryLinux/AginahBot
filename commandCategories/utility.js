const { MessageEmbed } = require('discord.js');
const { parseTimeString } = require('../lib');
const { generalErrorHandler } = require('../errorHandlers');
const tmp = require('tmp');
const fs = require('fs');

const sendTimestampMessage = async (message, targetDate) => {
  const embed = new MessageEmbed()
    .setTitle(`<t:${Math.floor(targetDate.getTime() / 1000)}:F>`)
    .setColor('#6081cb')
    .addField('Javascript / Node.js Timestamp', targetDate.getTime().toString())
    .addField('UNIX Timestamp', Math.floor(targetDate.getTime() / 1000).toString());
  return message.channel.send({ embeds: [embed] });
};

module.exports = {
  category: 'Utility Commands',
  commands: [
    {
      name: 'timestamp',
      description: 'Enter a date/time to determine its unix timestamp.',
      longDescription: 'Allowed date/times look like:\n\n' +
              '`X:00`: The next occurrence of the provided minutes value\n' +
              '`X+2:15` A set number of hours in the future, at the provided minute value\n' +
              '`HH:MM TZ`: The next occurrence of the provided time.\n' +
              '`MM/DD/YYYY HH:MM TZ`: The specific provided date and time.\n' +
              '`YYYY-MM-DD HH:MM TZ`: The specific provided date and time.\n\n' +
              'Strict ISO-8601 formatted datetime values are allowed.\n' +
              'UNIX Timestamps are allowed.\n' +
              'A list of timezones can be found on the Wikipedia timezone page under the `TZ database name` column.\n' +
              'https://en.wikipedia.org/wiki/List_of_tz_database_time_zones',
      aliases: ['ts'],
      usage: '`!aginah timestamp date/time`',
      guildOnly: false,
      moderatorRequired: false,
      adminOnly: false,
      async execute(message, args) {
        if (args.length === 0) {
          return message.channel.send('You must specify a date/time value.');
        }

        const timeString = args.join(' ').toUpperCase().trim();

        try{
          const targetDate = parseTimeString(timeString);
          return sendTimestampMessage(message, targetDate);
        } catch (error) {
          if (error.name && error.name === 'TimeParserValidationError') {
            return message.channel.send(error.message);
          }
          generalErrorHandler(error);
        }
      }
    },
    {
      name: 'save-log',
      description: 'Save a log of recent channel messages to a text file.',
      longDescription: 'Save a log of up to 1000 recent channel messages to a text file. ' +
              'Defaults to one hundred messages.',
      aliases: [],
      usage: '`!aginah save-log [limit]`',
      guildOnly: true,
      moderatorRequired: true,
      adminOnly: false,
      async execute(message, args) {
        if ((args.length > 0) && (!args[0].match(/^\d+$/))) {
          return message.channel.send('Limit argument must be an integer from 1 to 1000.');
        }

        // Control variables
        const logLimit = (args.length > 0) ? parseInt(args[0], 10) : 100;
        const logs = [];
        let lastMessageId = message.id;

        // Do not fetch more than 1000 messages from the Discord API
        if (logLimit < 1 || logLimit > 1000) {
          return message.channel.send('Limit argument must be an integer from 1 to 1000.');
        }

        while (logs.length < logLimit) {
          // Determine number of messages to be fetched this request
          const fetchLimit = ((logLimit - logs.length) > 100) ? 100 : (logLimit - logs.length);

          // Fetch messages from Discord API
          const messages = await message.channel.messages.fetch({
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
            return message.channel.send({
              files: [
                {
                  name: `${message.channel.name}-log.txt`,
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