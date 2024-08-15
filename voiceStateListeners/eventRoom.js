const { generalErrorHandler } = require('../errorHandlers');
const { getModeratorRole, dbQueryOne, dbExecute, buildControlMessagePayload } = require('../lib');
const { ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');

const channelNames = [
  // Fruits and Vegetables
  'Zucchini', 'Artichoke', 'Pineapple', 'Kumquat', 'Avocado', 'Blueberry', 'Mango', 'Strawberry',
  'Durian', 'Watermelon', 'Papaya', 'Cherry', 'Nectarine', 'Raspberry', 'Cantaloupe', 'Potato', 'Tomato', 'Broccoli',
  'Cauliflower', 'Cucumber', 'Asparagus', 'Rhubarb', 'Eggplant', 'Plantain', 'Banana', 'Apple', 'Cranberry', 'Orange',
  'Sweet Pea', 'Green Bean', 'Grape', 'Pear',
];

module.exports = async (client, oldState, newState) => {
  // If the user changed their voice state but remained in the same channel, do nothing (mute, deafen, etc.)
  if (oldState.channel && newState.channel && oldState.channel.id === newState.channel.id) { return; }

  if (newState.channel && newState.channel.id && newState.member.voice.channelId) {
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

      // Choose a channel name
      const channelName = channelNames[Math.floor(Math.random() * channelNames.length)];

      // Create voice channel
      const voiceChannel =  await newState.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: roomSystemStartGame.channelCategoryId,
      });

      // Send control message
      await voiceChannel.send(buildControlMessagePayload(newState.member));

      // TODO: Write a slash command handler for ready checks

      let sql = 'INSERT INTO room_system_games (roomSystemId, voiceChannelId) VALUES (?, ?)';
      await dbExecute(sql, [roomSystemStartGame.id, voiceChannel.id]);

      try {
        await newState.member.voice.setChannel(voiceChannel);
      } catch(e) {
        // Attempt to catch cases where a user leaves the "Create Game" channel before the bot can move them
        // to the newly created dynamic channel. In this case, delete the newly created channels
        await voiceChannel.delete();
      }
    }
  }

  if (oldState.channel && oldState.channel.id) {
    // User leaves a game channel
    let sql = `SELECT rs.id, rs.channelCategoryId
               FROM room_system_games rsg
               JOIN room_systems rs ON rsg.roomSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE rsg.voiceChannelId=?
                 AND gd.guildId=?`;
    const roomSystemLeaveGame = await dbQueryOne(sql, [oldState.channel.id, oldState.guild.id]);
    if (roomSystemLeaveGame) {
      sql = `SELECT id
             FROM room_system_games
             WHERE roomSystemId=?
               AND voiceChannelId=?`;
      const channelData = await dbQueryOne(sql, [roomSystemLeaveGame.id, oldState.channel.id]);
      // If the voice channel the user left was not a game channel, do nothing
      if (!channelData) { return; }

      // If the voice channel is now empty, destroy the role and channels
      if (oldState.channel.members.size === 0) {
        // Catch instances where multiple successive channel disconnects cause this function to run multiple times
        // asynchronously. This can occur when several people leave a dynamic room when an event ends.
        try{
          await oldState.channel.delete();
        } catch (e) {
          // Only report errors which do not look like a Discord API 404 error for a missing role or channel
          if (!e.status || e.status !== 404) {
            return generalErrorHandler(e);
          }
        }

        // Delete the database entry for this channel
        await dbExecute('DELETE FROM room_system_games WHERE id=?', [channelData.id]);
      }
    }
  }
};