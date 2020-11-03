const { generalErrorHandler } = require('../errorHandlers');

const DEFAULT_ROLE_NAME = "Dynamic Room Category"
const PLANNING_CHANNEL_NAME = 'Planning';
const VOICE_CHANNEL_NAME = 'Start Game';

module.exports = {
    category: "Dynamic Room Systems",
    commands: [
        {
            name: 'create-room-system',
            description: 'Add a dynamic room system to this server. It will automatically create voice and text ' +
                'channels on demand.',
            longDescription: null,
            aliases: ['crs'],
            usage: '`!aginah create-room-system [categoryName]`',
            guildOnly: true,
            minimumRole: null,
            adminOnly: true,
            execute(message, args) {
                // Create the system
                const roleName = args[0] ? args[0] : DEFAULT_ROLE_NAME;
                return message.guild.channels.create(roleName, { type: 'category' }).then((category) => {
                    Promise.all([
                        message.guild.channels.create(PLANNING_CHANNEL_NAME, { parent: category }),
                        message.guild.channels.create(VOICE_CHANNEL_NAME, { type: 'voice', parent: category }),
                    ]).then((channels) => {
                        const db = message.client.db;
                        db.get(`SELECT id FROM guild_data WHERE guildId=?`, message.guild.id, (err, row) => {
                            if (err) { return generalErrorHandler(err); }
                            let sql = `INSERT INTO room_systems (guildDataId, channelCategoryId, planningChannelId,
                                            newGameChannelId) VALUES (?, ?, ?, ?) `;
                            db.run(sql, row.id, category.id, channels[0].id, channels[1].id);
                        });
                    }).catch((error) => generalErrorHandler(error));
                });
            }
        },
        {
            name: 'destroy-room-system',
            description: 'Remove a role system system from this server.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah destroy-room-system categoryName`',
            guildOnly: true,
            minimumRole: null,
            adminOnly: true,
            execute(message, args) {
                if (!args[0]) {
                    return message.channel.send('You must provide the name of the dynamic room system to delete.\n' +
                        '`!aginah help destroy-room-system` for more info.');
                }

                message.guild.fetch().then((guild) => {
                    // Find a category whose name matches the argument
                    const category = guild.channels.cache.array().find((el) => el.name === args[0]);

                    // If no category matching the provided argument was found, inform the user
                    if (!category) { return message.channel.send('No dynamic room category with that name exists!'); }

                    const db = message.client.db;
                    let sql = `SELECT rs.id
                               FROM room_systems rs
                               JOIN guild_data gd ON rs.guildDataId = gd.id
                               WHERE channelCategoryId=?
                                    AND gd.guildId=?`;
                    db.get(sql, category.id, message.guild.id, (err, row) => {
                        if (!row) {
                            return message.channel.send('Your server does not have a dynamic room category ' +
                                'with that name.');
                        }

                        category.children.forEach((channel) => channel.delete());
                        category.delete();
                        db.run(`DELETE FROM room_system_games WHERE roomSystemId=?`, row.id);
                        db.run(`DELETE FROM room_systems WHERE id=?`, row.id);
                    });
                }).catch((e) => generalErrorHandler(e));
            }
        },
    ],
};