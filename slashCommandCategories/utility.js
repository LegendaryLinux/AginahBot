const { SlashCommandBuilder } = require('discord.js');
const tmp = require('tmp');
const fs = require('fs');

module.exports = {
  category: 'Utility Commands',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('save-log')
        .setDescription('Save a log of recent channel messages to a text file.')
        .addIntegerOption((opt) => opt
          .setName('limit')
          .setDescription('Number of messages to save. Min 1, max 1000, default 100')
          .setRequired(false))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const limit = interaction.options.getInteger('limit') ?? 100;

        // Control variables
        const logs = [];
        let lastMessageId = interaction.id;

        // Do not fetch more than 1000 messages from the Discord API
        if (limit < 1 || limit > 1000) {
          return interaction.reply({
            content: 'Limit argument must be an integer from 1 to 1000.',
            ephemeral: true,
          });
        }

        try{
          // This might take a few seconds
          await interaction.deferReply({ ephemeral: true });

          while (logs.length < limit) {
            // Determine number of messages to be fetched this request
            const fetchLimit = ((limit - logs.length) > 100) ? 100 : (limit - logs.length);

            // Fetch messages from Discord API
            const messages = await interaction.channel.messages.fetch({
              before: lastMessageId,
              limit: fetchLimit,
            });

            // Save relevant message data
            messages.each((msg) => {
              logs.push({
                id: msg.id,
                user: `${msg.author.username}#${msg.author.discriminator}`,
                timestamp: msg.createdTimestamp,
                content: msg.content,
              });
            });

            // Begin fetching from the earliest message
            lastMessageId = logs[logs.length - 1].id;

            // If no more messages are available, stop fetching
            if (messages.size <= fetchLimit) { break; }
          }

          // Reverse the array so the oldest messages occur first, and will therefore be printed earlier
          // in the output file
          logs.reverse();

          // Build output file
          let output = '';
          logs.forEach((log) => {
            output += `${log.user} (${new Date(log.timestamp).toUTCString()}):\n${log.content}\n\n`;
          });

          // Save the output to a temporary file and send it to the channel
          return tmp.file((err, tmpFilePath, fd, cleanupCallback) => {
            fs.writeFile(tmpFilePath, output, () => {
              return interaction.followUp({
                ephemeral: true,
                content: `Saved a log of the previous ${limit} messages in this channel.`,
                files: [
                  {
                    name: `${interaction.channel.name}-log.txt`,
                    attachment: tmpFilePath,
                  }
                ]
              });
            });
          });
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the Mod Contact feature could not be enabled ' +
            'on this server. Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
  ],
};
