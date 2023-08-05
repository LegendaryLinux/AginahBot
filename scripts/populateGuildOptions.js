const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('../config.json');
const { dbQueryOne, dbExecute } = require('../lib');

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ Partials.GuildMember, Partials.Message, Partials.Reaction ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});
client.login(config.token).then(async () => {
  console.debug('Connected.');
  console.debug(`This bot has been installed in ${client.guilds.cache.size} guilds.\n`);
  for (let guild of Array.from(client.guilds.cache.values())){
    await guild.fetch();
    console.log(`${guild.name} (${guild.id})`);
    console.log(`Members: ${guild.memberCount}`);

    const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [guild.id]);
    if (!guildData) {
      throw new Error(`No guildData entry found for ${guild.name} (${guild.id}).`);
    }

    const guildOptions = await dbQueryOne('SELECT 1 FROM guild_options WHERE guildDataId=?', guildData.id);
    if (!guildOptions) {
      await dbExecute('INSERT INTO guild_options (guildDataId) VALUES (?)', [guildData.id]);
      console.log('Guild options not found. They have been created.');
    }

    // For human readability
    console.log('\n');
  }

  client.destroy();
});
