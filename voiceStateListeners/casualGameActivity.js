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

    let sql = `SELECT gc.id, gc.channelCategoryId, gc.newGameChannelId
                FROM game_categories gc
                JOIN guild_data gd ON gc.guildDataId=gd.id
                WHERE gd.guildId=? AND categoryType='casual'`;
    client.db.get(sql, newState.guild.id, (err, categoryData) => {
        if (!categoryData) { return; }

        // If a user has entered the "Start Game" channel
        if (newState.channel && newState.channel.id === categoryData.newGameChannelId) {
            // TODO: Limit user channel creation speed

            const channelName = channelNames[randInRange(0, channelNames.length - 1)];
            newState.guild.roles.create({ data: { name: channelName, mentionable: true }}).then((role) => {
                Promise.all([
                    // Voice channel
                    newState.guild.channels.create(channelName, {
                        type: 'voice',
                        parent: categoryData.channelCategoryId,
                    }),

                    // Text channel
                    newState.guild.channels.create(channelName, {
                        type: 'text',
                        parent: categoryData.channelCategoryId,
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
                    let sql = `INSERT INTO casual_games (categoryId, voiceChannelId, textChannelId, roleId)
                                VALUES (?, ?, ?, ?)`;
                    client.db.run(sql, categoryData.id, channels[0].id, channels[1].id, role.id);
                    newState.member.voice.setChannel(channels[0]);
                    newState.member.roles.add(role);
                }).catch((error) => generalErrorHandler(error));
            });
        }

        // User leaves a game channel
        if (oldState.channel) {
            let sql = `SELECT id, roleId, textChannelId, voiceChannelId
                        FROM casual_games WHERE categoryId=? AND voiceChannelId=?`;
            client.db.get(sql, categoryData.id, oldState.channel.id, (err, channelData) => {
                if (err) { return generalErrorHandler(err); }

                // If the voice channel the user left was not a game channel, do nothing
                if (!channelData) { return; }

                // Remove channel role from this user
                const role = oldState.guild.roles.resolve(channelData.roleId);
                oldState.member.roles.remove(role);

                // Remove user from ready_checks table
                let sql = `SELECT id FROM casual_games WHERE voiceChannelId=? AND categoryId=?`;
                client.db.get(sql, oldState.channel.id, categoryData.id, (err, game) => {
                    let sql = `DELETE FROM casual_ready_checks WHERE gameId=? AND playerId=?`;
                    client.db.run(sql, game.id, oldState.member.id);
                });

                // If the voice channel is now empty, destroy the role and channels
                if (oldState.channel.members.array().length === 0) {
                    role.delete();
                    oldState.guild.channels.resolve(channelData.textChannelId).delete();
                    oldState.guild.channels.resolve(channelData.voiceChannelId).delete();

                    // Delete the database for for this channel
                    client.db.run(`DELETE FROM casual_games WHERE id=?`, channelData.id);
                }
            });
        }

        // User enters a game channel
        if (newState.channel) {
            let sql = `SELECT roleId FROM casual_games WHERE categoryId=? AND voiceChannelId=?`;
            client.db.get(sql, categoryData.id, newState.channel.id, (err, channelData) => {
                // If the voice channel the user entered is not a game channel, do nothing
                if (!channelData) { return; }

                // Grant the user the channel role
                const role = newState.guild.roles.resolve(channelData.roleId);
                newState.member.roles.add(role);

                let sql = `SELECT id FROM casual_games WHERE categoryId=? AND voiceChannelId=?`;
                client.db.get(sql, categoryData.id, newState.channel.id, (err, game) => {
                    if (err) { return generalErrorHandler(err); }

                    // Add the user to the ready checks table
                    let sql = `INSERT INTO casual_ready_checks (gameId, playerId, playerTag) VALUES (?,?,?)`;
                    client.db.run(sql, game.id, newState.member.id, newState.member.user.tag);
                });
            });
        }
    });
};