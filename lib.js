const Discord = require('discord.js');

module.exports = {
    // Function which returns a promise which will resolve to true or false
    verifyUserRole: (guildMember, minimumRoleName) => new Promise((resolve, reject) => {
        if (guildMember.hasPermission(Discord.Permissions.FLAGS.ADMINISTRATOR)) { resolve(true); }

        const memberRole = guildMember.roles.highest;
        guildMember.guild.roles.fetch().then((roles) => {
            for (const role of roles.cache) {
                if (role.name === minimumRoleName) {
                    resolve(role.rawPosition <= memberRole.rawPosition);
                }
            }
        }).error((error) => reject(error));
    }),

    verifyIsAdmin: (guildMember) => guildMember.hasPermission(Discord.Permissions.FLAGS.ADMINISTRATOR),
};