const errorHandlers = require('../errorHandlers');
const { verifyUserPermissions } = require('../lib');

module.exports = {
    name: 'help',
    description: 'Get a list of all available commands and a brief description of each.',
    aliases: ['commands'],
    usage: '`!aginah help [command name]`',
    guildOnly: true,
    execute(message, args) {
        const data = []; // Each entry in this array will be sent on a new line
        const { commands } = message.client;

        // Send data about all commands
        if (!args.length) {
            data.push('Available commands:');
            commands.forEach((command) => {
                verifyUserPermissions(message.member, command.minimumPermission).then((permitted) => {
                    if (permitted) { data.push(`\`${command.name}\`: ${command.description}`); }
                }).catch(errorHandlers.generalErrorHandler);
            });
            return message.author.send(data, { split: true }).then(() => {
                message.react('👍');
            }).catch((error) => {
                errorHandlers.dmErrorHandler(error, message);
                message.react('👎')
            });
        }

        // Send data about a specific command
        const command = commands.get(args[0].toLowerCase());
        if (!command) {
            message.react('👎');
            return message.author.send('That isn\'t a valid command!').then().catch((error) => {
                errorHandlers.dmErrorHandler(error, message);
            });
        }

        data.push(`**Name: ** ${command.name}`)
        if (command.aliases) { data.push(`**Aliases: **${command.aliases.join(', ')}`); }
        if (command.description) { data.push(`**Description: ** ${command.description}`); }
        if (command.usage) { data.push(`**Usage: ** ${command.usage}`); }
        message.author.send(data, { split: true }).then(() => {
            message.react('👍');
        }).catch((error) => {
            errorHandlers.dmErrorHandler(error, message);
            message.react('👎');
        });
    },
};