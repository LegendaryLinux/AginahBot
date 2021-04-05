module.exports = {
    category: 'Admin Commands',
    commands: [
        {
            name: 'archive',
            description: 'Lock a channel to prevent anyone (including moderators) from sending messages or reacting.',
            longDescription: 'Lock a channel to prevent anyone (including moderators) from sending messages or ' +
              'adding reactions. If the clone argument is provided, a new duplicate channel with the original ' +
              'permissions will be created. If the private argument is provided, the archived channel will be made ' +
              'invisible to everyone except administrators. Archived channels are publicly viewable by default.',
            aliases: [],
            usage: '`!aginah archive [clone] [private]`',
            minimumRole: null,
            adminOnly: true,
            guildOnly: true,
            async execute(message, args) {
                if (args.length > 0 && args.indexOf('clone') > -1) {
                    await message.channel.clone();
                }

                const denials = [ 'SEND_MESSAGES', 'ATTACH_FILES', 'ADD_REACTIONS' ];
                if (args.length > 0 && args.indexOf('private') > -1) {
                    denials.push('VIEW_CHANNEL');
                }

                return message.channel.edit({
                    name: `${message.channel.name}-archived`,
                    permissionOverwrites: [
                        {
                            id: message.guild.id,
                            deny: denials,
                        }
                    ],
                });
            },
        }
    ],
};