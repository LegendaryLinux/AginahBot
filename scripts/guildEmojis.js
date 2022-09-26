const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('../config.json');

if (process.argv.length !== 3) {
  return console.log('You must provide a guildId as an argument to this script.');
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
  const guild = client.guilds.resolve(process.argv[2]);
  console.log(`Found guild ${guild.name}.`);
  client.guilds.resolve(process.argv[2]).emojis.cache.each((emoji) => {
    console.log(emoji);
  });
  client.destroy();
});
