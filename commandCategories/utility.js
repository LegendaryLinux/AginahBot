const { MessageEmbed } = require('discord.js');
const moment = require("moment-timezone");

// Return the offset in hours of a given timezone
const getZoneOffset = (zone) => 0 - moment.tz.zone(zone).utcOffset(new Date().getTime()) / 60;

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
              "Strict ISO-8601 formatted datetime values are also allowed.\n" +
              "A list of timezones can be found on the Wikipedia timezone page under the `TZ database name` column.\n" +
              "https://en.wikipedia.org/wiki/List_of_tz_database_time_zones",
            aliases: ['ts'],
            usage: '`!aginah timestamp date/time`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    return message.channel.send("You must specify a date/time value.");
                }

                const timeString = args.join(' ').toUpperCase().trim();
                const currentDate = new Date();

                // Format: Strict ISO-8601
                const iso8601Pattern = new RegExp(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(Z|([+-]\d{2}:\d{2}))/);

                // Format: MM/DD/YYYY HH:II TZ
                const mdyPattern = new RegExp(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)/);

                // Format: YYYY-MM-DD HH:MM TZ
                const isoSimplePattern = new RegExp(/^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)/);

                // Format: HH:MM TZ
                const specificHourPattern = new RegExp(/^(\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)/);

                // Format XX:30
                const nextHourPattern = new RegExp(/^X{1,2}:(\d{2})/);

                // Format X+Y:15
                const futureHourPattern = new RegExp(/^X{1,2}\+(\d{1,2}):(\d{2})/);

                if (timeString.search(iso8601Pattern) > -1) {
                    const targetDate = new Date(timeString);
                    if (isNaN(targetDate.getTime())) {
                        return message.channel.send("The date you provided is invalid.");
                    }

                    return sendTimestampMessage(message, targetDate);

                } else if (timeString.search(mdyPattern) > -1) {
                    const patternParts = timeString.match(mdyPattern);
                    if (!moment.tz.zone(patternParts[6])) {
                        return message.channel.send("I don't recognize that timezone!");
                    }

                    const zoneOffset = getZoneOffset(patternParts[6]);
                    const sign = zoneOffset < 1 ? '-' : '+';
                    const targetDate = new Date(`${patternParts[3].toString().padStart(2, '0')}-` +
                      `${patternParts[1].toString().padStart(2, '0')}-${patternParts[2].toString().padStart(2, '0')}T` +
                      `${patternParts[4].toString().padStart(2, '0')}:${patternParts[5].toString().padStart(2, '0')}${sign}` +
                      `${Math.abs(zoneOffset).toString().padStart(2, '0')}:00`);
                    if (isNaN(targetDate.getTime())) {
                        return message.channel.send("The date you provided is invalid.");
                    }

                    return sendTimestampMessage(message, targetDate);

                } else if (timeString.search(isoSimplePattern) > -1) {
                    const patternParts = timeString.match(isoSimplePattern);
                    if (!moment.tz.zone(patternParts[6])) {
                        return message.channel.send("I don't recognize that timezone!");
                    }
                    const zoneOffset = getZoneOffset(patternParts[6]);
                    if (isNaN(zoneOffset)) {
                        return message.channel.send("I couldn't schedule your game because the timezone provided " +
                          "could not be used to create a valid date object.");
                    }

                    const sign = zoneOffset < 1 ? '-' : '+';
                    const targetDate = new Date(`${patternParts[1]}-${patternParts[2]}-${patternParts[3]}T` +
                      `${patternParts[4]}:${patternParts[5]}${sign}` +
                      `${Math.abs(zoneOffset).toString().padStart(2, '0')}:00`);

                    return sendTimestampMessage(message, targetDate);

                } else if (timeString.search(specificHourPattern) > -1) {
                    const patternParts = timeString.match(specificHourPattern);
                    if (parseInt(patternParts[1], 10) > 24) {
                        return message.channel.send("There are only 24 hours in a day!");
                    }

                    if (parseInt(patternParts[2], 10) > 59) {
                        return message.channel.send("There are only 60 minutes in an hour!");
                    }

                    if (!moment.tz.zone(patternParts[3])) {
                        return message.channel.send("I don't recognize that timezone!");
                    }
                    const zoneOffset = getZoneOffset(patternParts[3]);
                    if (isNaN(zoneOffset)) {
                        return message.channel.send("I couldn't schedule your game because the timezone provided " +
                          "could not be used to create a valid date object.");
                    }

                    const targetDate = new Date(message.createdTimestamp);
                    targetDate.setUTCHours((parseInt(patternParts[1], 10) - zoneOffset) % 24);
                    targetDate.setUTCMinutes(parseInt(patternParts[2], 10));

                    // If the offset UTC hour is in the past, bump the date up by one day
                    if (targetDate.getTime() < currentDate.getTime()) {
                        targetDate.setDate(targetDate.getDate() + 1);
                    }

                    return sendTimestampMessage(message, targetDate);

                } else if (timeString.search(nextHourPattern) > -1) {
                    const patternParts = timeString.match(nextHourPattern);
                    if (patternParts[1] > 59) {
                        return message.channel.send("There are only sixty minutes in an hour!");
                    }
                    const targetDate = new Date(`${currentDate.getUTCMonth() + 1}/${currentDate.getUTCDate()}` +
                      `/${currentDate.getUTCFullYear()} ${currentDate.getUTCHours()}:${patternParts[1]} UTC`);

                    if (targetDate.getTime() < currentDate.getTime()) {
                        targetDate.setUTCHours(targetDate.getUTCHours() + 1);
                    }

                    return sendTimestampMessage(message, targetDate);

                } else if (timeString.search(futureHourPattern) > -1) {
                    const patternParts = timeString.match(futureHourPattern);
                    if (patternParts[2] > 59) {
                        return message.channel.send("There are only sixty minutes in an hour!");
                    }

                    let targetDate = new Date(`${currentDate.getUTCMonth() + 1}/${currentDate.getUTCDate()}` +
                      `/${currentDate.getUTCFullYear()} ${currentDate.getUTCHours()}:${patternParts[2]} UTC`);

                    // Add requested hours to target date
                    targetDate = new Date(targetDate.getTime() + (parseInt(patternParts[1], 10) * 60 * 60 * 1000));

                    return sendTimestampMessage(message, targetDate);

                } else {
                    return message.channel.send("Sorry, I don't understand that time. Use " +
                      "`!aginah help timestamp` for more info.");
                }
            }
        },
    ],
};