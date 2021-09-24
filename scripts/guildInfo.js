const { Client, Intents} = require('discord.js');
const config = require('../config.json');

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ 'GUILD_MEMBER', 'MESSAGE', 'REACTION' ],
  intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.DIRECT_MESSAGES ],
});
client.login(config.token).then(async () => {
  console.debug('Connected.');
  console.debug(`This bot has been installed in ${client.guilds.cache.size} guilds.\n`);
  await client.guilds.cache.each(async (guild) => {
    await guild.fetch();
    console.log(`${guild.name} (${guild.id})`);
    console.log(`Members: ${guild.memberCount}\n`);
  });
  client.destroy();
});
