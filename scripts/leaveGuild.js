const { Client, GatewayIntentBits, Partials} = require('discord.js');
const config = require('../config.json');

const guildId = process.argv[2];

if (!guildId || !/^\d+$/.test(guildId)) {
  console.error('Usage: node scripts/leaveGuild.js <guildId>');
  process.exit(1);
}

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
  const guild = await client.guilds.fetch(guildId);
  console.debug(`Leaving guild: ${guild.name} (${guild.id})`);
  await guild.leave();
  console.debug('Done.')
  client.destroy();
});
