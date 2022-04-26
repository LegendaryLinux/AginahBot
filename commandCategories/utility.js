const { MessageEmbed } = require('discord.js');
const { parseTimeString } = require('../lib');
const { generalErrorHandler } = require('../errorHandlers');

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
            longDescription: "Allowed date/times look like:\n\n" +
              "`X:00`: The next occurrence of the provided minutes value\n" +
              "`X+2:15` A set number of hours in the future, at the provided minute value\n" +
              "`HH:MM TZ`: The next occurrence of the provided time.\n" +
              "`MM/DD/YYYY HH:MM TZ`: The specific provided date and time.\n" +
              "`YYYY-MM-DD HH:MM TZ`: The specific provided date and time.\n\n" +
              "Strict ISO-8601 formatted datetime values are allowed.\n" +
              "UNIX Timestamps are allowed.\n" +
              "A list of timezones can be found on the Wikipedia timezone page under the `TZ database name` column.\n" +
              "https://en.wikipedia.org/wiki/List_of_tz_database_time_zones",
            aliases: ['ts'],
            usage: '`!aginah timestamp date/time`',
            guildOnly: false,
            moderatorRequired: false,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    return message.channel.send("You must specify a date/time value.");
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
    ],
};