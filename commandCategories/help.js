const errorHandlers = require('../errorHandlers');
const { verifyUserRole } = require('../lib');

module.exports = {
    category: 'Help',
    commands: [
        {
            name: 'help',
            description: 'Get a list of all available commands and a brief description of each.',
            longDescription: null,
            aliases: ['commands'],
            usage: '`!aginah help [command name]`',
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
                            // If the command does not have a minimum role, always report on it
                            if (!command.minimumRole){
                                permittedCommands.push(`\`${command.name}\`: ${command.description}`);
                                return;
                            }

                            // If the command does have a minimum role, only report if the user has
                            // sufficient permissions
                            verifyUserRole(message.member, command.minimumRole).then((permitted) => {
                                if (permitted) {
                                    permittedCommands.push(`\`${command.name}\`: ${command.description}`);
                                }
                            }).catch(errorHandlers.generalErrorHandler);
                        });

                        if (permittedCommands.length > 0) {
                            data.push(`\n__${category.category}:__`);
                            permittedCommands.forEach((cmd) => data.push(cmd));
                        }
                    });
                    return message.author.send(data, { split: true }).then(() => {
                        message.react('👍');
                    }).catch((error) => {
                        errorHandlers.dmErrorHandler(error, message);
                        message.react('👎')
                    });
                }

                // Send data about a specific command
                const command = message.client.commands.get(args[0].toLowerCase());
                if (!command) {
                    message.react('👎');
                    return message.author.send('That isn\'t a valid command!').then().catch((error) => {
                        errorHandlers.dmErrorHandler(error, message);
                    });
                }

                data.push(`**Name: ** ${command.name}`)
                if (command.aliases) { data.push(`**Aliases: **${command.aliases.join(', ')}`); }
                if (command.longDescription) { data.push(`**Description:** ${command.longDescription}`) }
                else if (command.description) { data.push(`**Description: ** ${command.description}`); }
                if (command.usage) { data.push(`**Usage: ** ${command.usage}`); }
                message.author.send(data, { split: true }).then(() => {
                    message.react('👍');
                }).catch((error) => {
                    errorHandlers.dmErrorHandler(error, message);
                    message.react('👎');
                });
            },
        }
    ],
};