const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('../config.json');
const { dbQueryAll, dbQueryOne, dbExecute } = require('../lib');

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ Partials.GuildMember, Partials.Message, Partials.Reaction ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});
client.login(config.token).then(async () => {
  let sql = `SELECT gd.guildId, rs.id AS roomSystemId, rsg.id AS gameId, rsg.voiceChannelId,
                rsg.textChannelId, rsg.roleId
             FROM room_system_games rsg
             JOIN room_systems rs ON rsg.roomSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id`;
  const games = await dbQueryAll(sql, []);
  for (let game of games) {

    try{
      // Check that the bot is a member of the guild, and that the game's channels and role exist
      await client.guilds.fetch(game.guildId);
    } catch(e) {
      if (e.status && e.status === 404) {
        console.log(`Bot does not appear to be a member of guild with id ${game.guildId}. Removing DB entries.`);
        await dbExecute('DELETE FROM room_system_games WHERE id=?', [game.gameId]);
        await dbExecute('DELETE FROM room_systems WHERE id=?', [game.roomSystemId]);
        continue;
      }
      // Print the error to the console
      console.error(e);
      continue;
    }

    try {
      const guild = await client.guilds.fetch(game.guildId);
      await guild.channels.fetch(game.voiceChannelId);
      await guild.channels.fetch(game.textChannelId);
      await guild.roles.fetch(game.roleId);
    } catch(e) {
      if (e.status && e.status === 404) {
        console.log(`Room system game with id ${game.gameId} appears invalid. Removing DB entries.`);
        await dbExecute('DELETE FROM room_system_games WHERE id=?', [game.gameId]);
        continue;
      }
      // Print the error to the console
      console.error(e);
    }
  }

  // Exit the script
  console.log('Done.');
  client.destroy();
});
