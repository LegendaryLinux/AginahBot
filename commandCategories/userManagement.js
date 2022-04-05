const config = require('../config.json');

const lookupGuildMember = async (guild, query) => {
    // If this is an ID search, try to find a specific user
    if (query.search(/^\d+$/) > -1) {
        await guild.members.fetch();
        const user = guild.members.resolve(query);
        return [user];
    }

    // Search for guild member by name
    const guildMembers = await guild.members.fetch({
        query,
        limit: 20,
    });

    return Array.from(guildMembers);
};

const fetchAuditLogMessages = async (guild, guildMember) => {
    const auditLogs = await guild.fetchAuditLogs({
        type: 'MEMBER_UPDATE',
        user: guildMember.id,
        // limit: 100,
    });
    if (auditLogs.entries.size === 0) {
        return 'User has no audit log entries.';
    }

    Array.from(auditLogs.entries).forEach((log) => {
        console.log(log[1].action);
    });

    return 'Done.';
};

const buildUserInfoMessage = (guildMember) => {

};

module.exports = {
    category: 'User Management',
    commands: [
        {
            name: 'user-audit',
            description: 'Fetch the audit logs relevant to a user. The username provided must be a username, not ' +
              'a nickname. An example username is `Farrak Kilhn`. If the username includes spaces, you must ' +
              'surround it with quotes.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah user-audit username`',
            minimumRole: config.moderatorRole,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                if (args.length !== 1) {
                    return message.channel.send('Invalid argument count! Use `!aginah help user-history` for info.');
                }

                // Find matching guild members
                const guildMembers = await lookupGuildMember(message.guild, args[0]);

                if (guildMembers.length === 0) {
                    return message.channel.send('No user could be matched to your search.');
                }

                if (guildMembers.length > 1) {
                    let msg = 'Multiple users were matched. If your desired user is in the list below, try ' +
                      ' searching by their ID.\n```';

                    guildMembers.forEach((guildMember) => {
                        guildMember = guildMember[1];
                        msg += `\n${guildMember.id}: ${guildMember.user.username}#${guildMember.user.discriminator}` +
                          ` (${guildMember.nickname || 'No Alias' })`;
                    });

                    msg += '```';
                    return message.channel.send(msg);
                }

                message.channel.send(await fetchAuditLogMessages(message.guild, guildMembers[0]));
            },
        }
    ],
};
