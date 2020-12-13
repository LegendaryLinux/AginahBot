const { generalErrorHandler } = require('../errorHandlers');
const { getModeratorRole } = require('../lib');

const channelNames = ['Zucchini', 'Artichoke', 'Pineapple', 'Kumquat', 'Avocado', 'Blueberry', 'Mango', 'Strawberry',
    'Durian', 'Watermelon', 'Papaya', 'Cherry', 'Nectarine', 'Raspberry', 'Cantaloupe', 'Potato', 'Tomato', 'Broccoli',
    'Cauliflower', 'Cucumber', 'Asparagus', 'Rhubarb', 'Eggplant', 'Plantain', 'Banana'];

const randInRange = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min);
};

module.exports = (client, oldState, newState) => {
    // If the user changed their voice state but remained in the same channel, do nothing (mute, deafen, etc.)
    if (oldState.channel && newState.channel && oldState.channel.id === newState.channel.id) { return; }

    if (newState.channel) {
        // If a user has entered the "Start Game" channel
        let sql = `SELECT rs.id, rs.channelCategoryId
                   FROM room_systems rs
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                        AND rs.newGameChannelId=?`;
        client.db.query(sql, [newState.guild.id, newState.channel.id], (err, roomSystem) => {
            if (err) { return generalErrorHandler(err); }
            if (roomSystem.length) {
                roomSystem = roomSystem[0];
                const channelName = channelNames[randInRange(0, channelNames.length - 1)];
                newState.guild.roles.create({ data: { name: channelName, mentionable: true }}).then((role) => {
                    Promise.all([
                        // Voice channel
                        newState.guild.channels.create(channelName, {
                            type: 'voice',
                            parent: roomSystem.channelCategoryId,
                        }),

                        // Text channel
                        newState.guild.channels.create(channelName, {
                            type: 'text',
                            parent: roomSystem.channelCategoryId,
                            permissionOverwrites: [
                                {
                                    // @everyone may not view the text channel
                                    id: newState.guild.id,
                                    deny: [ 'VIEW_CHANNEL' ],
                                },
                                {
                                    // Moderators should be able to view this channel
                                    id: getModeratorRole(newState.guild).id,
                                    allow: [ 'VIEW_CHANNEL' ],
                                },
                                {
                                    // @AginahBot may view the text channel
                                    id: client.user.id,
                                    allow: [ 'VIEW_CHANNEL' ],
                                },
                                {
                                    // Role assignees may view the channel
                                    id: role.id,
                                    allow: [ 'VIEW_CHANNEL' ],
                                }
                            ],
                        })
                    ]).then((channels) => {
                        channels[1].send(`Hello! Use this channel to discuss the ${channelName} game.\n` +
                            '__Ready Checks:__\n' +
                            '`.ready` to show you are ready to begin\n' +
                            '`.unready` to change your mind\n' +
                            '`.readycheck` to see who is ready\n\n' +
                            '__Privacy Controls:__\n' +
                            '`.close` to close this channel\n' +
                            '`.lock` to prevent others from joining\n' +
                            '`.unlock` to allow people to join again');

                        let sql = `INSERT INTO room_system_games (roomSystemId, voiceChannelId, textChannelId, roleId)
                                VALUES (?, ?, ?, ?)`;
                        client.db.execute(sql, [roomSystem.id, channels[0].id, channels[1].id, role.id]);
                        newState.member.voice.setChannel(channels[0]);
                        newState.member.roles.add(role);
                    }).catch((error) => generalErrorHandler(error));
                });
            }
        });

        // If the user has entered a game channel
        sql = `SELECT rs.id, rs.channelCategoryId
               FROM room_system_games rsg
               JOIN room_systems rs ON rsg.roomSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE rsg.voiceChannelId=?
                    AND gd.guildId=?`;
        client.db.query(sql, [newState.channel.id, newState.guild.id], (err, roomSystem) => {
            if (err) { return generalErrorHandler(err); }
            if (roomSystem.length) {
                roomSystem = roomSystem[0];
                sql = `SELECT id, roleId FROM room_system_games WHERE roomSystemId=? AND voiceChannelId=?`;
                client.db.query(sql, [roomSystem.id, newState.channel.id], (err, gameData) => {
                    // If the voice channel the user entered is not a game channel, do nothing
                    if (!gameData.length) { return; }
                    gameData = gameData[0];

                    // Grant the user the channel role
                    const role = newState.guild.roles.resolve(gameData.roleId);
                    newState.member.roles.add(role);

                    // Add the user to the ready checks table
                    let sql = `INSERT INTO room_system_ready_checks (gameId, playerId, playerTag) VALUES (?,?,?)`;
                    client.db.execute(sql, [gameData.id, newState.member.id, newState.member.user.tag]);
                });
            }
        });
    }

    if (oldState.channel) {
        // User leaves a game channel
        let sql = `SELECT rs.id, rs.channelCategoryId
                   FROM room_system_games rsg
                   JOIN room_systems rs ON rsg.roomSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE rsg.voiceChannelId=?
                        AND gd.guildId=?`;
        client.db.query(sql, [oldState.channel.id, oldState.guild.id], (err, roomSystem) => {
            if (err) { return generalErrorHandler(err); }
            if (roomSystem.length) {
                roomSystem = roomSystem[0];
                let sql = `SELECT id, roleId, textChannelId, voiceChannelId
                           FROM room_system_games
                           WHERE roomSystemId=?
                                AND voiceChannelId=?`;
                client.db.query(sql, [roomSystem.id, oldState.channel.id], (err, channelData) => {
                    if (err) { return generalErrorHandler(err); }

                    // If the voice channel the user left was not a game channel, do nothing
                    if (!channelData.length) { return; }
                    channelData = channelData[0];

                    // Remove channel role from this user
                    const role = oldState.guild.roles.resolve(channelData.roleId);
                    oldState.member.roles.remove(role);

                    // Remove user from ready_checks table
                    let sql = `SELECT id FROM room_system_games WHERE voiceChannelId=? AND roomSystemId=?`;
                    client.db.query(sql, [oldState.channel.id, roomSystem.id], (err, game) => {
                        let sql = `DELETE FROM room_system_ready_checks WHERE gameId=? AND playerId=?`;
                        client.db.execute(sql, [game[0].id, oldState.member.id]);
                    });

                    // If the voice channel is now empty, destroy the role and channels
                    if (oldState.channel.members.array().length === 0) {
                        role.delete();
                        oldState.guild.channels.resolve(channelData.textChannelId).delete();
                        oldState.guild.channels.resolve(channelData.voiceChannelId).delete();

                        // Delete the database for for this channel
                        client.db.execute(`DELETE FROM room_system_games WHERE id=?`, [channelData.id]);
                    }
                });
            }
        });
    }
};