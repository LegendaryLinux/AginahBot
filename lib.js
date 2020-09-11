const Discord = require('discord.js');

module.exports = {
    // Function which returns a promise which will resolve to true or false
    verifyUserPermissions: (guildMember, minimumPermissionString) => new Promise((resolve, reject) => {
        if (guildMember.hasPermission(Discord.Permissions.FLAGS.ADMINISTRATOR)) { resolve(true); }

        const memberRole = guildMember.roles.highest;
        guildMember.guild.roles.fetch().then((roles) => {
            for (const role of roles.cache) {
                if (role.name === minimumPermissionString) {
                    resolve(role.rawPosition <= memberRole.rawPosition);
                }
            }
        }).error((error) => reject(error));
    }),
};