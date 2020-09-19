const Discord = require('discord.js');
const {generalErrorHandler} = require('./errorHandlers');
const config = require('./config.json');

module.exports = {
    // Function which returns a promise which will resolve to true or false
    verifyModeratorRole: (guildMember) => {
        if (module.exports.verifyIsAdmin(guildMember)) { return true; }
        return module.exports.getModeratorRole(guildMember.guild).position <= guildMember.roles.highest.position;
    },

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

    cacheRoleRequestMessages: (client) => {
        client.guilds.cache.each((guild) => {
            let sql = `SELECT rc.messageId, rs.roleRequestChannelId
                        FROM role_categories rc
                        JOIN role_systems rs ON rc.roleSystemId=rs.id
                        JOIN guild_data gd ON rs.guildDataId=gd.id
                        WHERE gd.guildId=?`;
            client.db.each(sql, guild.id, (err, roleCategory) => {
                if (err) { return generalErrorHandler(err); }

                // Cache the role requestor category messages. This is required because reactions can only
                // be monitored on cached messages.
                guild.channels.resolve(roleCategory.roleRequestChannelId).messages.fetch(roleCategory.messageId);
            });
        });
    },

    /**
     * Get an emoji object usable with Discord. Null if the Emoji is not usable in the provided guild.
     * @param guild
     * @param emoji
     * @returns String || Object || null
     */
    parseEmoji: (guild, emoji) => {
        const emojiIdRegex = new RegExp(/^<:.*:(\d+)>$/);
        const match = emoji.match(emojiIdRegex);
        if (match && match.length > 1) {
            const emojiObj = guild.emojis.resolve(match[1]);
            return emojiObj ? emojiObj : null;
        }

        const nodeEmoji = require('node-emoji');
        return nodeEmoji.hasEmoji(emoji) ? emoji : null;
    },
};