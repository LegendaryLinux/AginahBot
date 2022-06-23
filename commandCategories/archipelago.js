const ArchipelagoInterface = require("../Archipelago/ArchipelagoInterface");

module.exports = {
    category: 'Archipelago',
    commands: [
        {
            name: 'ap-connect',
            description: 'Begin monitoring an Archipelago game in the current text channel',
            longDescription: null,
            aliases: ['apc'],
            usage: '`!aginah ap-connect server:port gameName slotName`',
            moderatorRequired: false,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                if (args.length < 3) {
                    return message.channel.send('Invalid arguments passed. Syntax:' +
                      '```!aginah apc server:port gameName slotName```');
                }

                if (message.client.tempData.apInterfaces.has(message.channel.id)) {
                    return message.channel.send('An Archipelago game is already being monitored in this channel ' +
                      'and must be disconnected before a new game can be monitored.');
                }

                // Establish a connection to the Archipelago game
                const APInterface = new ArchipelagoInterface(message.channel, args[0], args[1], args[2]);

                // Check if the connection was successful every half second for ten seconds
                for (let i=0; i<20; ++i){
                    // Wait half of a second
                    await new Promise((resolve) => (setTimeout(resolve, 500)));

                    // If the client fails to connect, its status will eventually read disconnected
                    if (APInterface.APClient.status === 'Disconnected') { return; }

                    if (APInterface.APClient.status === 'Connected') {
                        message.client.tempData.apInterfaces.set(message.channel.id, APInterface);

                        // Automatically disconnect and destroy this interface after six hours
                        return setTimeout(() => {
                            if (message.channel.template.apInterfaces.has(message.channel.id)) {
                                message.client.tempData.apInterfaces.get(message.channel.id).disconnect();
                                message.client.tempData.apInterfaces.delete(message.channel.id);
                            }
                        }, 21600000);
                    }
                }
            },
        },
        {
            name: 'ap-disconnect',
            description: 'Stop monitoring an Archipelago game in the current text channel',
            longDescription: null,
            aliases: ['apd'],
            usage: '`!aginah ap-disconnect`',
            moderatorRequired: false,
            adminOnly: false,
            guildOnly: true,
            async execute(message) {
                // Notify the user if there is no game being monitored in the current text channel
                if (!message.client.tempData.apInterfaces.has(message.channel.id)) {
                    return message.channel.send('There is no Archipelago game being monitored in this channel.');
                }

                // Disconnect the ArchipelagoInterface from the game and destroy the object in tempData
                message.client.tempData.apInterfaces.get(message.channel.id).disconnect();
                message.client.tempData.apInterfaces.delete(message.channel.id);
                return message.channel.send('Disconnected from Archipelago game.');
            },
        },
        {
            name: 'ap-set-alias',
            description: 'Associate your discord user with a specified alias',
            longDescription: null,
            aliases: ['apsa'],
            usage: '`!aginah ap-set-alias alias`',
            moderatorRequired: false,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                // Notify the user if there is no game being monitored in the current text channel
                if (!message.client.tempData.apInterfaces.has(message.channel.id)) {
                    return message.channel.send('There is no Archipelago game being monitored in this channel.');
                }

                if (args.length < 1) {
                    return message.channel.send('You must specify an alias to associate with');
                }

                // Associate the user with the specified alias
                message.client.tempData.apInterfaces.get(message.channel.id).setPlayer(args[0], message.author);
            },
        },
        {
            name: 'ap-unset-alias',
            description: 'Disassociate your discord user with a specified alias',
            longDescription: null,
            aliases: ['apua'],
            usage: '`!aginah ap-unset-alias`',
            moderatorRequired: false,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                // Notify the user if there is no game being monitored in the current text channel
                if (!message.client.tempData.apInterfaces.has(message.channel.id)) {
                    return message.channel.send('There is no Archipelago game being monitored in this channel.');
                }

                if (args.length < 1) {
                    return message.channel.send('You must specify an alias to associate with');
                }

                // Disassociate the user from the specified alias
                message.client.tempData.apInterfaces.get(message.channel.id).unsetPlayer(args[0]);
            },
        },
    ],
};
