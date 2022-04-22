const { generalErrorHandler } = require('../errorHandlers');
const { dbQueryAll, dbQueryOne, dbExecute } = require('../lib');
const { MessageActionRow, MessageButton} = require("discord.js");

module.exports = {
    category: 'Mod Contact',
    commands: [
        {
            name: 'init-mod-contact',
            description: 'Enable the Mod Contact feature in a Discord server.',
            longDescription: 'Enable the Mod Contact feature in a Discord server. This will create a category ' +
              'containing a single channel with a message where users can click on a button to contact the mods.',
            aliases: [],
            usage: '`!aginah init-mod-contact`',
            minimumRole: null,
            adminOnly: true,
            guildOnly: true,
            async execute(message) {
                // If the Mod Contact feature has already been enabled for this guild, do nothing
                let guildDataId = await dbQueryOne(`SELECT id FROM guild_data WHERE guildId=?`, message.guild.id);
                guildDataId = guildDataId.id;

                const existing = await dbQueryOne(`SELECT 1 FROM mod_contact WHERE guildDataId=?`, [guildDataId]);
                if (existing) {
                    return message.channel.send('The Mod Contact feature is already enabled for this server!');
                }

                // Create a category to contain the report channels
                const category = await message.guild.channels.create('Mod Contact', {
                    type: "GUILD_CATEGORY",
                    permissionOverwrites: [
                        {
                            // @everyone may not send messages or add reactions
                            id: message.guild.id,
                            deny: [ 'SEND_MESSAGES', 'ADD_REACTIONS' ],
                        },
                        {
                            // @AginahBot may post in this category
                            id: message.client.user.id,
                            allow: [ 'SEND_MESSAGES' ],
                        },
                    ],
                });

                const channel = await message.guild.channels.create('mod-contact', {
                    type: 'GUILD_TEXT',
                    topic: 'Privately contact the moderator team.',
                    parent: category.id,
                    permissionOverwrites: [
                        {
                            // @everyone may not send messages or add reactions
                            id: message.guild.id,
                            deny: [ 'SEND_MESSAGES', 'ADD_REACTIONS' ],
                        },
                        {
                            // @AginahBot may post in this channel
                            id: message.client.user.id,
                            allow: [ 'SEND_MESSAGES' ],
                        },
                    ],
                });

                const buttonRow = new MessageActionRow().addComponents(
                  new MessageButton()
                    .setLabel('Contact Moderators')
                    .setStyle('PRIMARY')
                    .setCustomId('mod-contact')
                )

                const contactMessage = await channel.send({
                    content: 'If you need to contact the moderators, simply click the button below. A private ' +
                      'channel visible only to you and the moderators will be created. Your conversation will be ' +
                      'confidential.',
                    components: [ buttonRow ],
                });

                // Update database with mod_contact data
                let sql = `INSERT INTO mod_contact (guildDataId, categoryId, channelId, messageId) VALUES (?, ?, ?, ?)`;
                return dbExecute(sql, [ guildDataId, category.id, channel.id, contactMessage.id ])
            },
        },
        {
            name: 'destroy-mod-contact',
            description: 'Remove the Mod Contact feature from a Discord server.',
            longDescription: 'Remove the Mod Contact feature from a Discord server. This also removes all ' +
              'Mod Contact history.',
            aliases: [],
            usage: '`!aginah destroy-mod-contact`',
            minimumRole: null,
            adminOnly: true,
            guildOnly: true,
            async execute(message) {
                // Fetch information about this guild's mod-contact feature
                let sql = `SELECT mc.id, mc.categoryId
                           FROM mod_contact mc
                           JOIN guild_data gd ON mc.guildDataId = gd.id
                           WHERE gd.guildId = ?`;
                const modContact = await dbQueryOne(sql, [ message.guild.id ]);

                // If the feature isn not enabled, alert the user
                if (!modContact) {
                    return message.channel.send('The Mod Contact feature is not enabled for this server.');
                }

                // Delete entries for previous mod contact events
                await dbExecute(`DELETE FROM mod_contact_channels WHERE modContactId=?`, [ modContact.id ]);

                // Delete the guild category and channels
                await message.guild.channels.resolve(modContact.categoryId).delete();

                return dbExecute(`DELETE FROM mod_contact WHERE id=?`, [ modContact.id ]);
            },
        }
    ],
};