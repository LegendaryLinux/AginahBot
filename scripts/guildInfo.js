const { Client, GatewayIntentBits } = require('discord.js');
const config = require('../config.json');

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ 'GUILD_MEMBER', 'MESSAGE', 'REACTION' ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});
client.login(config.token).then(async () => {
  console.debug('Connected.');
  console.debug(`This bot has been installed in ${client.guilds.cache.size} guilds.\n`);
  await client.guilds.cache.each(async (guild) => {
    await guild.fetch();
    console.log(`${guild.name} (${guild.id})`);
    console.log(`Members: ${guild.memberCount}\n`);
  });
});
