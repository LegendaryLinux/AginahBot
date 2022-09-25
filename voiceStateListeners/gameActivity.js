const { generalErrorHandler } = require('../errorHandlers');
const { getModeratorRole, dbQueryOne, dbExecute } = require('../lib');
const { ChannelType } = require('discord.js');

const channelNames = [
  // Fruits and Vegetables
  'Zucchini', 'Artichoke', 'Pineapple', 'Kumquat', 'Avocado', 'Blueberry', 'Mango', 'Strawberry',
  'Durian', 'Watermelon', 'Papaya', 'Cherry', 'Nectarine', 'Raspberry', 'Cantaloupe', 'Potato', 'Tomato', 'Broccoli',
  'Cauliflower', 'Cucumber', 'Asparagus', 'Rhubarb', 'Eggplant', 'Plantain', 'Banana', 'Apple', 'Cranberry', 'Orange',
];

const randInRange = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min);
};

module.exports = async (client, oldState, newState) => {
  // If the user changed their voice state but remained in the same channel, do nothing (mute, deafen, etc.)
  if (oldState.channel && newState.channel && oldState.channel.id === newState.channel.id) { return; }

  if (newState.channel) {
    // If a user has entered the "Start Game" channel
    let sql = `SELECT rs.id, rs.channelCategoryId
               FROM room_systems rs
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE gd.guildId=?
                 AND rs.newGameChannelId=?`;
    const roomSystemStartGame = await dbQueryOne(sql, [newState.guild.id, newState.channel.id]);
    if (roomSystemStartGame) {
      const moderatorRole = await getModeratorRole(newState.guild);
      // If no moderator role can be found
      if (!moderatorRole) {
        await newState.member.send(`Uh, oh! It looks like \`${newState.guild.name}\` doesn't have a \`Moderator\` ` +
          'role. Please tell an admin about this!');
        console.error(`No moderator role could be found for guild ${newState.guild.name} (${newState.guild.id})`);
        return;
      }

      // Track which voice channel names are currently in use by the guild
      if (!client.tempData.voiceRooms.has(newState.guild.id)) {
        client.tempData.voiceRooms.set(newState.guild.id, new Map());
      }

      // Choose a channel name
      let channelName = channelNames[randInRange(0, channelNames.length - 1)];
      // If there are channel names available, find one that isn't in use
      if (client.tempData.voiceRooms.get(newState.guild.id).size < channelNames.length) {
        while (client.tempData.voiceRooms.get(newState.guild.id).has(channelName)) {
          channelName = channelNames[randInRange(0, channelNames.length - 1)];
        }
      } else {
        channelName = `${channelName}-${client.tempData.voiceRooms.get(newState.guild.id).size}`;
      }

      await newState.guild.roles.create({ name: channelName, mentionable: true }).then((role) => {
        Promise.all([
          // Voice channel
          newState.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: roomSystemStartGame.channelCategoryId,
          }),

          // Text channel
          newState.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: roomSystemStartGame.channelCategoryId,
            permissionOverwrites: [
              {
                // @everyone may not view the text channel
                id: newState.guild.id,
                deny: [ 'VIEW_CHANNEL' ],
              },
              {
                // Moderators should be able to view this channel
                id: moderatorRole.id,
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
        ]).then(async (channels) => {
          channels[1].send(`Hello! Use this channel to discuss the ${channelName} game.\n` +
            '__Alerts__\n' +
            '`.ping roomCode` to ping RSVPed players with a game reminder\n\n' +
            '__Ready Checks:__\n' +
            '`.ready` to show you are ready to begin\n' +
            '`.unready` to change your mind\n' +
            '`.readycheck` to see who is ready\n\n' +
            '__Privacy Controls:__\n' +
            '`.close roomCode` to close this channel\n' +
            '`.lock` to prevent others from joining\n' +
            '`.unlock` to allow people to join again');

          let sql = `INSERT INTO room_system_games (roomSystemId, voiceChannelId, textChannelId, roleId)
                     VALUES (?, ?, ?, ?)`;
          await dbExecute(sql, [roomSystemStartGame.id, channels[0].id, channels[1].id, role.id]);
          await newState.member.voice.setChannel(channels[0]);
          await newState.member.roles.add(role);
          client.tempData.voiceRooms.get(newState.guild.id).set(channelName, 1);
        }).catch((error) => generalErrorHandler(error));
      });
    }

    // If the user has entered a game channel
    sql = `SELECT rs.id, rs.channelCategoryId
           FROM room_system_games rsg
           JOIN room_systems rs ON rsg.roomSystemId = rs.id
           JOIN guild_data gd ON rs.guildDataId = gd.id
           WHERE rsg.voiceChannelId=?
             AND gd.guildId=?`;
    const roomSystemJoinGame = await dbQueryOne(sql, [newState.channel.id, newState.guild.id]);
    if (roomSystemJoinGame) {
      sql = 'SELECT id, roleId FROM room_system_games WHERE roomSystemId=? AND voiceChannelId=?';
      const gameData = await dbQueryOne(sql, [roomSystemJoinGame.id, newState.channel.id]);
      // If the voice channel the user entered is not a game channel, do nothing
      if (!gameData) { return; }

      // Grant the user the channel role
      const role = newState.guild.roles.resolve(gameData.roleId);
      newState.member.roles.add(role);

      // Add the user to the ready checks table
      sql = 'REPLACE INTO room_system_ready_checks (gameId, playerId, playerTag) VALUES (?,?,?)';
      await dbExecute(sql, [gameData.id, newState.member.id, newState.member.user.tag]);
    }
  }

  if (oldState.channel) {
    // User leaves a game channel
    let sql = `SELECT rs.id, rs.channelCategoryId
               FROM room_system_games rsg
               JOIN room_systems rs ON rsg.roomSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE rsg.voiceChannelId=?
                 AND gd.guildId=?`;
    const roomSystemLeaveGame = await dbQueryOne(sql, [oldState.channel.id, oldState.guild.id]);
    if (roomSystemLeaveGame) {
      sql = `SELECT id, roleId, textChannelId, voiceChannelId
             FROM room_system_games
             WHERE roomSystemId=?
               AND voiceChannelId=?`;
      const channelData = await dbQueryOne(sql, [roomSystemLeaveGame.id, oldState.channel.id]);
      // If the voice channel the user left was not a game channel, do nothing
      if (!channelData) { return; }

      // Remove channel role from this user
      const role = oldState.guild.roles.resolve(channelData.roleId);
      await oldState.member.roles.remove(role);

      // Remove user from ready_checks table
      sql = 'SELECT id FROM room_system_games WHERE voiceChannelId=? AND roomSystemId=?';
      const game = await dbQueryOne(sql, [oldState.channel.id, roomSystemLeaveGame.id]);

      sql = 'DELETE FROM room_system_ready_checks WHERE gameId=? AND playerId=?';
      await dbExecute(sql, [game.id, oldState.member.id]);

      // If the voice channel is now empty, destroy the role and channels
      if (oldState.channel.members.size === 0) {
        // Remove the channel from the array of current voice channels if it exists
        if (client.tempData.voiceRooms.has(oldState.guild.id)) {
          client.tempData.voiceRooms.get(oldState.guild.id).delete(oldState.channel.name);
        }

        await role.delete();
        await oldState.guild.channels.resolve(channelData.textChannelId).delete();
        await oldState.guild.channels.resolve(channelData.voiceChannelId).delete();

        // Delete the database entry for for this channel
        await dbExecute('DELETE FROM room_system_games WHERE id=?', [channelData.id]);
      }
    }
  }
};