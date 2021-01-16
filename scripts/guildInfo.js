const { Client } = require('discord.js');
const config = require('../config.json');

console.debug('Logging into Discord...');
const client = new Client();
client.login(config.token).then(async () => {
  console.debug('Connected.');
  console.debug(`This bot has been installed in ${client.guilds.cache.array().length} guilds.\n`);
  for (let guild of client.guilds.cache.array()) {
    await guild.fetch();
    console.log(`${guild.name} (${guild.id})`);
    console.log(`Members: ${guild.memberCount}\n`);
  }
  client.destroy();
});
