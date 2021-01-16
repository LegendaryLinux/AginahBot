const { Client } = require('discord.js');
const config = require('../config.json');

if (!process.argv[2]) {
  return console.warn('A guildId must be provided as an argument.\nUsage: node guildChannelInfo.js guildId');
}

console.debug('Logging into Discord...');
const client = new Client();
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
  for (let channel of guild.channels.cache.array()) {
    console.debug(`\n${channel.name} (${channel.id})`);
    console.debug(`Type: ${channel.type}`);
  }
  client.destroy();
});
