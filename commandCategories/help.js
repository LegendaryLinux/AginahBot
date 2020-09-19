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
            minimumRole: null,
            adminOnly: false,
            guildOnly: true,
            execute(message, args) {
                const data = []; // Each entry in this array will be sent on a new line
                const { commandCategories } = message.client;

                // Send data about all commandCategories
                if (!args.length) {
                    data.push('Command Categories:');
                    commandCategories.forEach((category) => {
                        const permittedCommands = [];

                        category.commands.forEach((command) => {
                            // If the command requires admin access, do not report it if the user is not admin
                            if (command.adminOnly && !verifyIsAdmin(message.member)) { return; }

                            // If the command does not have a minimum role, always report on it
                            if (!command.minimumRole){
                                permittedCommands.push(`\`${command.name}\`: ${command.description}`);
                                return;
                            }

                            // If the command does have a minimum role, only report if the user has
                            // sufficient permissions
                            if (verifyModeratorRole(message.member)) {
                                permittedCommands.push(`\`${command.name}\`: ${command.description}`);
                            }
                        });

                        if (permittedCommands.length > 0) {
                            data.push(`\n__${category.category}:__`);
                            permittedCommands.forEach((cmd) => data.push(cmd));
                        }
                    });
                    return message.author.send(data, { split: true }).catch((error) =>
                        errorHandlers.dmErrorHandler(error, message));
                }

                // Send data about a specific command
                const command = message.client.commands.get(args[0].toLowerCase());
                if (!command) {
                    return message.author.send('That isn\'t a valid command!').then().catch((error) => {
                        errorHandlers.dmErrorHandler(error, message);
                    });
                }

                data.push(`**Name: ** ${command.name}`)
                if (command.aliases) { data.push(`**Aliases: **${command.aliases.join(', ')}`); }
                if (command.longDescription) { data.push(`**Description:** ${command.longDescription}`) }
                else if (command.description) { data.push(`**Description: ** ${command.description}`); }
                if (command.usage) { data.push(`**Usage: ** ${command.usage}`); }
                message.channel.send(data, { split: true }).then(() => {
                }).catch((error) => errorHandlers.generalErrorHandler(error));
            },
        }
    ],
};