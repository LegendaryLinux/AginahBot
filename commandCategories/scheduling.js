const {generalErrorHandler} = require('../errorHandlers');
const moment = require('moment-timezone');

// Return the offset in hours of a given timezone
const getZoneOffset = (zone) => 0 - moment.tz('1970-01-01 00:00', zone).toDate().getTime() / 1000 / 60 / 60;

const months = { 0: 'January', 1: 'February', 2: 'March', 3: 'April', 4: 'May', 5: 'June', 6: 'July', 7: 'August',
    8: 'September', 9: 'October', 10: 'November', 11: 'December' };

const sendScheduleMessage = (message, targetDate) => message.channel.send([
    `${message.author} wants to schedule a game for ` +
    `${months[targetDate.getUTCMonth()]} ${targetDate.getUTCDate()}, ${targetDate.getUTCFullYear()} at ` +
    `${targetDate.getUTCHours()}:${targetDate.getUTCMinutes().toString().padStart(2,'0')} UTC`,
    `https://gametimes.multiworld.link/?timestamp=${targetDate.getTime()}`,
    'React with ⚔ if you intend to join this game.',
    'React with 🐔 if you don\'t know yet.'
]).then((scheduleMessage) => {
    // Save scheduled game to database
    message.client.db.query(`SELECT id FROM guild_data WHERE guildId=?`, [message.guild.id], (err, guildData) => {
        if (err) { throw new Error(err); }
        if (!guildData.length) { throw new Error(`Unable to find guild ${message.guild.name} (${message.guild.id}) ` +
            `in guild_data table.`); }
        guildData = guildData[0];
        let sql = `INSERT INTO scheduled_events
                    (guildDataId, timestamp, channelId, messageId, schedulingUserId, schedulingUserTag)
                    VALUES (?, ?, ?, ?, ?, ?)`;
        message.client.db.execute(sql, [guildData.id, targetDate.getTime(), scheduleMessage.channel.id, scheduleMessage.id,
            message.member.user.id, message.member.user.tag]);
    });

    // Put appropriate reactions onto the message
    scheduleMessage.react('⚔');
    scheduleMessage.react('🐔');
}).catch((error) => generalErrorHandler(error));

module.exports = {
    category: 'Event Scheduling',
    commands: [
        {
            name: 'schedule',
            description: 'View upcoming events or schedule a new one',
            longDescription: "View upcoming events or Schedule a new one. Allowed times look like:\n\n" +
                "`X:00`: Schedule a game for the next occurrence of the provided minutes value\n" +
                "`HH:MM TZ`: Schedule a game for the next occurrence of the provided time.\n" +
                "`MM/DD/YYYY HH:MM TZ`: Schedule a game for the specific provided date and time.\n" +
                "`YYYY-MM-DD HH:MM TZ` Schedule a game for a specific provided date and time.\n\n" +
                "Strict ISO-8601 formatted datetime values are also allowed.\n" +
                "Users subject to daylight savings time, be aware you may have two different timezones. EST / EDT, " +
                "for example.\n",
            aliases: [],
            usage: '`!aginah schedule [role date/time]`',
            guildOnly: true,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    let sql = `SELECT se.timestamp, se.schedulingUserTag, se.channelId, se.messageId,
                                    (SELECT COUNT(*) FROM event_attendees WHERE eventId=se.id) AS rsvpCount
                                FROM scheduled_events se
                                JOIN guild_data gd ON se.guildDataId = gd.id
                                WHERE gd.guildId=?
                                    AND se.timestamp > ?`;
                    let gameCount = 0;
                    return message.client.db.query(sql, [message.guild.id, new Date().getTime()], (err, games) => {
                        if (err) { throw new Error(err); }
                        games.forEach((game) => {
                            message.guild.channels.resolve(game.channelId).messages.fetch(game.messageId)
                                .then((scheduleMessage) => {
                                    const gameTime = new Date(parseInt(game.timestamp, 10));
                                    message.channel.send(
                                        `> **${game.schedulingUserTag}** scheduled a game for **` +
                                        `${gameTime.getUTCMonth()+1}/${gameTime.getUTCDate()}/` +
                                        `${gameTime.getUTCFullYear()} ${gameTime.getUTCHours()}:` +
                                        `${gameTime.getUTCMinutes().toString().padStart(2, '0')} UTC**.\n` +
                                        `> In your timezone: ` +
                                        `https://gametimes.multiworld.link/` +
                                        `?timestamp=${parseInt(game.timestamp, 10)}\n` +
                                        `> RSVP Link: ${scheduleMessage.url}\n` +
                                        `> Current RSVPs: ${game.rsvpCount}`);
                                }).catch((err) => generalErrorHandler(err));
                            gameCount++;
                        });
                    }, () => {
                        if (gameCount === 0) {
                            message.channel.send("There are currently no games scheduled.");
                        }
                    });
                }

                if (args.length < 2) {
                    return message.channel.send("Looks like you're missing some arguments. Use " +
                        "`!aginah help schedule` for more info.");
                }

                // Remove the role argument, since we don't do anything with it
                args.shift();

                const timeString = args.join(' ').toUpperCase().trim();
                const currentDate = new Date();

                // Format: Strict ISO-8601
                const iso8601Pattern = new RegExp(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(Z|([+-]\d{2}:\d{2}))$/);

                // Format: MM/DD/YYYY HH:II TZ
                const mdyPattern = new RegExp(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}) ([A-z]*)$/);

                // Format: YYYY-MM-DD HH:MM TZ
                const isoSimplePattern = new RegExp(/^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}) ([A-z]*)$/);

                // Format: HH:MM TZ
                const specificHourPattern = new RegExp(/^(\d{1,2}):(\d{2}) ([A-z]*)$/);

                // Format XX:30
                const nextHourPattern = new RegExp(/^X{1,2}:(\d{2})$/);

                if (timeString.search(iso8601Pattern) > -1) {
                    const targetDate = new Date(timeString);
                    if (isNaN(targetDate.getTime())) {
                        return message.channel.send("The date you provided is invalid.");
                    }

                    if (targetDate.getTime() < currentDate.getTime()) {
                        return message.channel.send("You can't schedule a game in the past!");
                    }

                    return sendScheduleMessage(message, targetDate);

                } else if (timeString.search(mdyPattern) > -1) {
                    const patternParts = timeString.match(mdyPattern);
                    if (!moment.tz.zone(patternParts[6])) {
                        return message.channel.send("I don't recognize that timezone! Does your timezone " +
                            "change for daylight savings time?");
                    }

                    const targetDate = new Date(timeString);
                    if (isNaN(targetDate.getTime())) {
                        return message.channel.send("The date you provided is invalid.");
                    }

                    if (targetDate.getTime() < currentDate.getTime()) {
                        return message.channel.send("You can't schedule a game in the past!");
                    }

                    return sendScheduleMessage(message, targetDate);

                } else if (timeString.search(isoSimplePattern) > -1) {
                    const patternParts = timeString.match(isoSimplePattern);
                    if (!moment.tz.zone(patternParts[6])) {
                        return message.channel.send("I don't recognize that timezone! Does your timezone " +
                            "change for daylight savings time?");
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

                    if (targetDate.getTime() < currentDate.getTime()) {
                        return message.channel.send("You can't schedule a game in the past!");
                    }

                    return sendScheduleMessage(message, targetDate);

                } else if (timeString.search(specificHourPattern) > -1) {
                    const patternParts = timeString.match(specificHourPattern);
                    if (parseInt(patternParts[1], 10) > 24) {
                        return message.channel.send("There are only 24 hours in a day!");
                    }

                    if (parseInt(patternParts[2], 10) > 59) {
                        return message.channel.send("There are only 60 minutes in an hour!");
                    }

                    if (!moment.tz.zone(patternParts[3])) {
                        return message.channel.send("I don't recognize that timezone! Does your timezone " +
                            "change for daylight savings time?");
                    }
                    const zoneOffset = getZoneOffset(patternParts[3]);
                    if (isNaN(zoneOffset)) {
                        return message.channel.send("I couldn't schedule your game because the timezone provided " +
                            "could not be used to create a valid date object.");
                    }

                    const targetDate = new Date(currentDate.getTime());
                    targetDate.setUTCHours(parseInt(patternParts[1], 10));
                    targetDate.setUTCMinutes(parseInt(patternParts[2], 10));
                    targetDate.setUTCSeconds(0);
                    targetDate.setUTCMilliseconds(0);
                    targetDate.setTime(targetDate.getTime() - (zoneOffset * 60 * 60 * 1000));

                    while (targetDate.getTime() < currentDate.getTime()) {
                        targetDate.setTime(targetDate.getTime() + (24 * 60 * 60 * 1000));
                    }

                    sendScheduleMessage(message, targetDate);

                } else if (timeString.search(nextHourPattern) > -1) {
                    const patternParts = timeString.match(nextHourPattern);
                    if (patternParts[1] > 59) {
                        return message.channel.send("There are only sixty minutes in an hour!");
                    }
                    const targetDate = new Date(`${currentDate.getUTCMonth()+1}/${currentDate.getUTCDate()}`+
                        `/${currentDate.getUTCFullYear()} ${currentDate.getUTCHours()}:${patternParts[1]} UTC`);

                    if (targetDate.getTime() < currentDate.getTime()) {
                        targetDate.setUTCHours(targetDate.getUTCHours() + 1);
                    }

                    return sendScheduleMessage(message, targetDate);

                } else {
                    return message.channel.send("Sorry, I don't understand that time. Use " +
                        "`!aginah help schedule` for more info.");
                }
            }
        },
    ],
};