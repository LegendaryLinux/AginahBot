const { supportedGames } = require('../assets/supportedGames.json');

module.exports = {
    category: 'Helpful Messages',
    commands: [
        {
            name: 'setup',
            description: 'Get instructions on how to start playing games!',
            longDescription: null,
            aliases: ['setup-guide'],
            usage: '`!aginah setup game`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    return message.channel.send("You must specify which game to get the setup guide for. " +
                        "Use `!aginah games` to get a list of available games.");
                }

                if (!supportedGames.hasOwnProperty(args[0].toLowerCase())) {
                    return message.channel.send("There is no setup guide available for that game.");
                }

                return message.channel.send(`The setup guide may be found here:\n` +
                    `${supportedGames[args[0].toLowerCase()].setupGuide}`);
            }
        },
        {
            name: 'website',
            description: 'Get the link to a game\'s website.',
            longDescription: null,
            aliases: ['site', 'webpage'],
            usage: '`!aginah website game`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    return message.channel.send("You must specify which game to get the website for. " +
                        "Use `!aginah games` to get a list of available games.");
                }

                if (!supportedGames.hasOwnProperty(args[0].toLowerCase())) {
                    return message.channel.send("There is no website available for that game.");
                }

                return message.channel.send(`The website may be found here:\n` +
                    `${supportedGames[args[0].toLowerCase()].website}`);
            }
        },
        {
            name: 'code',
            description: 'Get links to the code repositories associated with a game.',
            longDescription: null,
            aliases: ['github', 'git'],
            usage: '`!aginah code game`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    return message.channel.send("The AginahBot code may be found here:\n" +
                        "https://github.com/LegendaryLinux/AginahBot");
                }

                if (!supportedGames.hasOwnProperty(args[0].toLowerCase())) {
                    return message.channel.send("There are no code repositories available for that game.");
                }

                const game = supportedGames[args[0].toLowerCase()];
                return message.channel.send([
                    `The code repositories associated with the ${game.friendlyName} project are:`,
                    ...game.repositories
                ]);
            }
        },
    ],
};