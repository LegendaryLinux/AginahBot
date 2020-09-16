const Discord = require('discord.js');
const {generalErrorHandler} = require('./errorHandlers');
const config = require('./config.json');

module.exports = {
    // Function which returns a promise which will resolve to true or false
    verifyUserRole: (guildMember, minimumRoleName) => new Promise((resolve, reject) => {
        if (module.exports.verifyIsAdmin(guildMember)) { resolve(true); }

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

    getModeratorRole: (guild) => {
        // Find this guild's moderator role
        for (const role of guild.roles.cache.array()) {
            if (role.name === config.moderatorRole) {
                return role;
            }
        }
        return null;
    },

    handleGuildCreate: (client, guild) => {
        // Find this guild's moderator role id
        let moderatorRole = module.exports.getModeratorRole(guild);
        if (!moderatorRole) {
            moderatorRole = guild.roles.create({
                data: {
                    name: config.moderatorRole,
                    reason: `AginahBot requires a ${config.moderatorRole} role.`
                },
            });
        }

        let sql = `INSERT INTO guild_data (guildId, moderatorRoleId) VALUES (?, ?)`;
        client.db.run(sql, guild.id, moderatorRole.id, (err) => {
            if (err) { return generalErrorHandler(err); }
        });
    },

    handleGuildDelete: (client, guild) => {
        client.db.get(`SELECT id FROM guild_data WHERE guildId=?`, guild.id, (err, guildData) => {
            if (err) { return generalErrorHandler(err); }
            if (!guildData) {
                return console.log(`No guild data could be found when trying to delete data for guild:` +
                    `${guild.name} (${guild.id}).`);
            }

            // Delete dynamic game system data
            client.db.get(`SELECT id FROM game_categories WHERE guildDataId=?`, guildData.id, (err, category) => {
                if (err) { return generalErrorHandler(err); }
                if (!category) { return; }
                client.db.run(`DELETE FROM casual_games WHERE categoryId=?`, category.id);
                client.db.run(`DELETE FROM race_games WHERE categoryId=?`, category.id);
                client.db.run(`DELETE FROM game_categories WHERE id=?`, category.id);
            });

            // Delete role requestor system data
            client.db.get(`SELECT id FROM role_systems WHERE guildDataId=?`, guildData.id, (err, roleSystem) =>{
                if (err) { return generalErrorHandler(err); }
                if (!roleSystem) { return; }
                client.db.get(`SELECT id FROM role_categories WHERE roleSystemId=?`, roleSystem.id, (err, category) => {
                    if (err) { return generalErrorHandler(err); }
                    if (!category) { return; }
                    client.db.run(`DELETE FROM roles WHERE categoryId=?`, category.id);
                });
                client.db.run(`DELETE FROM role_categories WHERE roleSystemId=?`, roleSystem.id);
                client.db.run(`DELETE FROM role_systems WHERE id=?`, roleSystem.id);
            });

            // Delete guild data
            client.db.run(`DELETE FROM guild_data WHERE id=?`, guildData.id);
        });
    },

    verifyGuildSetups: (client) => {
        client.guilds.cache.each((guild) => {
            client.db.get(`SELECT 1 FROM guild_data WHERE guildId=?`, guild.id, (err, row) => {
                if (err) { return generalErrorHandler(err); }
                if (!row) { module.exports.handleGuildCreate(client, guild); }
            });
        });
    },
};