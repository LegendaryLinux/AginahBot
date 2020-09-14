const { generalErrorHandler } = require('../errorHandlers');

const CATEGORY_NAME = 'Sync Multi';
const PLANNING_CHANNEL_NAME = 'Planning';
const VOICE_CHANNEL_NAME = 'Start Game';

module.exports = {
    category: "Casual Games",
    commands: [
        {
            name: 'init-casual-system',
            description: 'Configure this server to dynamically create channels for multiplayer games.',
            longDescription: null,
            aliases: ['ics'],
            usage: '`!aginah init-casual-system`',
            guildOnly: true,
            minimumRole: null,
            adminOnly: true,
            execute(message) {
                const db = message.client.db;
                let sql = `SELECT 1 FROM game_categories WHERE guildId=? AND categoryType='casual'`;
                db.get(sql, message.guild.id, (err, row) => {
                    if (!row) {
                        // Create the system
                        message.guild.channels.create(CATEGORY_NAME, { type: 'category' }).then((category) => {
                            Promise.all([
                                message.guild.channels.create(PLANNING_CHANNEL_NAME, { parent: category }),
                                message.guild.channels.create(VOICE_CHANNEL_NAME, { type: 'voice', parent: category }),
                            ]).then((channels) => {
                                let sql = `INSERT INTO game_categories (guildId, categoryType, channelCategoryId,
                                            planningChannelId, newGameChannelId) VALUES (?, 'casual', ?, ?, ?) `;
                                db.run(sql, message.guild.id, category.id, channels[0].id, channels[1].id);
                            }).catch((error) => generalErrorHandler(error));
                        });
                        return message.react('👍');
                    } else {
                        // System already exists. Abort.
                        message.channel.send('Your server is already set up to handle dynamic casual channels.');
                        return message.react('👎');
                    }
                });
            }
        },
        {
            name: 'destroy-casual-system',
            description: 'Remove the casual multiplayer system from this server, if it has one initialized.',
            longDescription: null,
            aliases: ['dcs'],
            usage: '`!aginah destroy-casual-system`',
            guildOnly: true,
            minimumRole: null,
            adminOnly: true,
            execute(message) {
                const db = message.client.db;
                let sql = `SELECT id, channelCategoryId FROM game_categories WHERE guildId=? AND categoryType='casual'`;
                db.get(sql, message.guild.id, (err, row) => {
                    if (!row) {
                        message.channel.send('Your server is not configured to handle dynamic casual channels.');
                        return message.react('👎');
                    } else {
                        const category = message.guild.channels.resolve(row.channelCategoryId);
                        category.children.forEach((channel) => channel.delete());
                        category.delete();
                        db.run(`DELETE FROM casual_games WHERE categoryId=?`, row.id);
                        db.run(`DELETE FROM game_categories WHERE id=?`, row.id);
                    }
                });
                return message.react('👍');
            }
        },
    ],
};