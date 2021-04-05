module.exports = {
    category: 'Admin Commands',
    commands: [
        {
            name: 'archive',
            description: 'Lock a channel to prevent anyone (including moderators) from sending messages or reacting.',
            longDescription: 'Lock a channel to prevent anyone (including moderators) from sending messages or ' +
              'adding reactions. If the clone argument is provided, a new duplicate channel with the original ' +
              'permissions will be created.',
            aliases: [],
            usage: '`!aginah archive [clone]`',
            minimumRole: null,
            adminOnly: true,
            guildOnly: true,
            async execute(message, args) {
                if (args.length > 0 && args[0] === 'clone') {
                    await message.channel.clone();
                }

                return message.channel.edit({
                    name: `${message.channel.name}-archived`,
                    permissionOverwrites: [
                        {
                            id: message.guild.id,
                            deny: [ 'SEND_MESSAGES', 'ATTACH_FILES', 'ADD_REACTIONS' ],
                        }
                    ],
                });
            },
        }
    ],
};