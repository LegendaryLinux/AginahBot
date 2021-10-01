const { Client, Intents} = require('discord.js');
const config = require('../config.json');

if (process.argv.length !== 3) {
  return console.log('You must provide a guildId as an argument to this script.');
}

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ 'GUILD_MEMBER', 'MESSAGE', 'REACTION' ],
  intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.DIRECT_MESSAGES ],
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
