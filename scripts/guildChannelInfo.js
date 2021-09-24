const { Client, Intents} = require('discord.js');
const config = require('../config.json');

if (!process.argv[2]) {
  return console.warn('A guildId must be provided as an argument.\nUsage: node guildChannelInfo.js guildId');
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

  if (!guild) {
    // Ruh-roh, Rhaggy!
    return console.error(`Unable to resolve guild with id ${process.argv[2]}`);
  }

  await guild.fetch();
  console.debug(`Found guild ${guild.name} (${guild.id}) with ${guild.memberCount} members.`);
  console.debug('The following channels were found within this guild:');
  await guild.channels.cache.each((channel) => {
    console.debug(`\n${channel.name} (${channel.id})`);
    console.debug(`Type: ${channel.type}`);
  });
  client.destroy();
});
