const {generalErrorHandler} = require('../errorHandlers');

const sendScheduleMessage = (message, targetDate) => message.channel.send([
    `${message.author} wants to schedule a game for ` +
    `${targetDate.getUTCMonth()+1}/${targetDate.getUTCDate()}/${targetDate.getUTCFullYear()} at `+
    `${targetDate.getUTCHours()}:${targetDate.getUTCMinutes().toString().padStart(2,'0')} UTC`,
    `https://gametimes.multiworld.link/?timestamp=${targetDate.getTime()}`,
    'React with ⚔ if you intend to join this game.',
    'React with 🐔 if you don\'t know yet.'
]).then((msg) => {
    msg.react('⚔');
    msg.react('🐔');
}).catch((error) => generalErrorHandler(error));

module.exports = {
    category: 'Scheduling',
    commands: [
        {
            name: 'schedule',
            description: 'Schedule a MultiWorld game',
            longDescription: "Schedule a MultiWorld game. Allowed times look like:\n\n" +
                "`X:00`: Schedule a game for the next occurrence of the provided minutes value\n\n" +
                "`14:00 EST`: Schedule a game for the next occurrence of the provided time and " +
                "timezone. Users subject to daylight savings time, be aware you may have two " +
                "different timezones. EST / EDT, for example.\n\n" +
                "`01/01/2020 07:00 GMT`: Schedule a game for the specific provided time.\n",
            aliases: [],
            usage: '`!aginah schedule [role] [time]`',
            guildOnly: true,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (arguments.length < 2) {
                    return message.channel.send("Looks like you're missing some arguments. Use " +
                        "`!aginah help schedule` for more info.");
                }

                // Remove the role argument, since we don't do anything with it
                args.shift();

                const timeString = args.join(' ').toUpperCase().trim();
                const currentDate = new Date();

                // Format: 12/31/2020 4:30 PDT
                const fullDatePattern = new RegExp(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}) ([A-Z]*)$/);

                // Format: 14:50 CST
                const timePattern = new RegExp(/^(\d{1,2}):(\d{2}) ([A-Z]*)$/);

                // Format XX:30
                const nextHourPattern = new RegExp(/^X{1,2}:(\d{2})$/);

                if (timeString.search(fullDatePattern) > -1) {
                    const targetDate = new Date(timeString);
                    if (isNaN(targetDate.getTime())) {
                        return message.channel.send("The date you provided is invalid.");
                    }

                    if (targetDate.getTime() < currentDate.getTime()) {
                        return message.channel.send("You can't schedule a game in the past!");
                    }

                    return sendScheduleMessage(message, targetDate);

                } else if (timeString.search(timePattern) > -1) {
                    const patternParts = timeString.match(timePattern);
                    const targetDate = new Date(`${currentDate.getUTCMonth()+1}/${currentDate.getUTCDate()}`+
                        `/${currentDate.getUTCFullYear()} ${patternParts[1]}:${patternParts[2]} ${patternParts[3]}`);

                    // If the target hour is in the past, schedule the game for the next day
                    if (targetDate.getTime() < currentDate.getTime()) {
                        targetDate.setUTCDate(targetDate.getUTCDate() + 1);
                    }

                    return sendScheduleMessage(message, targetDate);

                } else if (timeString.search(nextHourPattern) > -1) {
                    const patternParts = timeString.match(nextHourPattern);
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