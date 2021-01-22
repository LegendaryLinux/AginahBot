const Discord = require('discord.js');
const config = require('../config.json');
const dailies = require('./dailyGames.json');
const { supportedGames } = require('../assets/supportedGames.json');
const { presets } = require('../assets/presets.json');
const axios = require('axios');

const client = new Discord.Client();
client.login(config.token).then(async () => {
  try{
    for (let daily of dailies) {
      // Do not attempt to generate inactive dailies
      if (!daily.active) { continue; }

      // Resolve guild
      let guild = client.guilds.resolve(daily.guildId);
      if (!guild) {
        console.error(`Unable to resolve guild with id ${daily.guildId}`);
        continue;
      }

      // Fetch guild and resolve channel
      await guild.fetch();
      let channel = guild.channels.resolve(daily.channelId);
      if (!channel) {
        console.error(`Unable to resolve channel ${daily.channelId} in guild ${guild.id}`);
        continue;
      }

      const embed = new Discord.MessageEmbed()
        .setTitle('Daily Games')
        .setColor('#cd9b37')
        .setDescription(`Click a link below to download your patch files.`)
        .setTimestamp((new Date()).getTime());

      // Build weights object to use when generating games
      const weights = {};
      for (let i=0; i<5; i++) {
        // Choose a random preset from among allowed presets
        weights[`Player${i+1}`] = Object.assign({},
          presets[daily.game][daily.presets[Math.floor(Math.random() * daily.presets.length)]]);
        weights[`Player${i+1}`].name = `Player${i+1}`;

        let response = await axios.post(supportedGames[daily.game].apiEndpoint, { weights, race: 0, });
        embed.addField(`${i+1} Player`, response.data.url);
      }

      // Unpin all bot messages
      const pinnedMessages = await channel.messages.fetchPinned();
      for (let msg of pinnedMessages.array()) {
        if (msg.author.bot) { await msg.unpin(); }
      }

      // Send a message containing the dailies to the specified channel
      const dailyMessage = await channel.send(embed);
      await dailyMessage.pin();
    }
    client.destroy();
  }catch(Error) {
    console.error(Error);
    client.destroy();
  }
});
