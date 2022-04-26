const errorHandlers = require('../errorHandlers');
const { verifyModeratorRole, verifyIsAdmin } = require('../lib');

module.exports = {
    category: 'Help',
    commands: [
        {
            name: 'help',
            description: 'Get a list of all available commands and a brief description of each.',
            longDescription: null,
            aliases: ['commands'],
            usage: '`!aginah help [command name]`',
            moderatorRequired: false,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                const data = []; // Each entry in this array will be sent on a new line
                const { commandCategories } = message.client;

                // Send data about all commandCategories
                if (!args.length) {
                    data.push('Command Categories:');
                    for (let category of commandCategories) {
                        const permittedCommands = [];

                        for (let command of category.commands) {
                            // If the command requires admin access, do not report it if the user is not admin
                            if (command.adminOnly && !verifyIsAdmin(message.member)) { continue; }

                            // If the command does not have role restrictions, always report on it
                            if (!command.moderatorRequired){
                                permittedCommands.push(`\n\`${command.name}\`: ${command.description}`);
                                continue;
                            }

                            // If the command requires a moderator, only report if the user has sufficient permissions
                            if (await verifyModeratorRole(message.member)) {
                                permittedCommands.push(`\n\`${command.name}\`: ${command.description}`);
                            }
                        }

                        if (permittedCommands.length > 0) {
                            data.push(`\n\n__${category.category}:__`);
                            permittedCommands.forEach((cmd) => data.push(cmd));
                        }
                    }

                    return message.author.send(data.join('')).catch((error) =>
                        errorHandlers.dmErrorHandler(error, message));
                }

                // Send data about a specific command
                const command = message.client.commands.get(args[0].toLowerCase());
                if (!command) {
                    return message.channel.send('I don\'t know that command. Use `!aginah help` for more info.')
                        .then().catch((error) => {
                        errorHandlers.dmErrorHandler(error, message);
                    });
                }

                data.push(`**Name: ** ${command.name}`)
                if (command.aliases.length > 0) { data.push(`**Aliases: **${command.aliases.join(', ')}`); }
                if (command.longDescription) { data.push(`**Description:** ${command.longDescription}`) }
                else if (command.description) { data.push(`**Description: ** ${command.description}`); }
                if (command.usage && typeof(command.usage) === 'object' && command.usage.length) {
                    command.usage.forEach((usage) => data.push(`**Usage: ** ${usage}`));
                } else if (command.usage) { data.push(`**Usage: ** ${command.usage}`); }
                message.channel.send(data.join('\n'))
                  .then(() => {})
                  .catch((error) => errorHandlers.generalErrorHandler(error));
            },
        }
    ],
};