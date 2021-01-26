const Discord = require('discord.js');
const config = require('../config.json');
const regularGames = require('./regularGames.json');
const { supportedGames } = require('../assets/supportedGames.json');
const { presets } = require('../assets/presets.json');
const axios = require('axios');

const client = new Discord.Client();
client.login(config.token).then(async () => {
  try{
    for (let daily of regularGames) {
      // Do not attempt to generate inactive dailies
      if (!daily.active) { continue; }

      // If no games are scheduled to be rolled this hour, do nothing
      let workThisHour = false;
      for (let seedSet of daily.seedSets) {
        if (seedSet.targetUTCHour === new Date().getUTCHours()) { workThisHour = true; }
      }
      if (!workThisHour) { continue; }

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

      // Unpin all bot messages
      const pinnedMessages = await channel.messages.fetchPinned();
      for (let msg of pinnedMessages.array()) {
        if (msg.author.bot) { await msg.unpin(); }
      }

      // Loop over all seeds set to occur
      for (let seedSet of daily.seedSets) {
        // If this seed is not scheduled to run this hour, do nothing
        if (seedSet.targetUTCHour !== new Date().getUTCHours()) { continue; }

        const embed = new Discord.MessageEmbed()
          .setTitle(seedSet.title)
          .setColor('#cd9b37')
          .setDescription(`Click a link below to download your patch files.`)
          .setTimestamp((new Date()).getTime());

        // Build weights object to use when generating games
        const weights = {};
        for (let i=seedSet.minPlayers; i<=seedSet.maxPlayers; i++) {
          // Choose a random preset from among allowed presets
          weights[`Player${i}`] = Object.assign({},
            presets[seedSet.game][seedSet.presets[Math.floor(Math.random() * seedSet.presets.length)]]);
          weights[`Player${i}`].name = `Player${i}`;

          let response = await axios.post(supportedGames[seedSet.game].apiEndpoint, { weights, race: 0, });
          embed.addField(`${i} Player`, response.data.url);
        }

        // Send a message containing the dailies to the specified channel
        const dailyMessage = await channel.send(embed);
        await dailyMessage.pin();
      }
    }
    client.destroy();
  }catch(Error) {
    console.error(Error);
    client.destroy();
  }
});
