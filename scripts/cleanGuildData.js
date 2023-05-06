const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('../config.json');
const { dbQueryAll, dbQueryOne, dbExecute, handleGuildDelete } = require('../lib');

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ Partials.GuildMember, Partials.Message, Partials.Reaction ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});

client.login(config.token).then(async () => {
  // Get a current list of all guilds the bot is present in
  const currentGuilds = [];
  client.guilds.cache.each((guild) => currentGuilds.push(guild.id));

  // Get a list of all the guilds the bot has guildData for
  const guildData = await dbQueryAll('SELECT id, guildId FROM guild_data');
  for (let guild of guildData) {
    // If the bot is no longer present in a guild it has data for, delete the data for that guild
    if (!currentGuilds.includes(guild.guildId)) {
      console.info(`Purging obsolete guild data for guild with id ${guild.guildId}`);
      await handleGuildDelete(client, { id: guild.guildId, name: 'Unknown' });
    }

    // If the guild does not have a guild_options entry, create one
    const guildOptions = await dbQueryOne('SELECT 1 FROM guild_options WHERE guildDataId=?', [guild.id]);
    if (!guildOptions) {
      console.info(`Creating guild_options entry for guild with id ${guild.guildId}`);
      await dbExecute('INSERT INTO guild_options (guildDataId) VALUES (?)', [guild.id]);
    }
  }

  console.info('Done.');
  client.destroy();
});