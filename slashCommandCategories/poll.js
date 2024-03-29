const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  category: 'Polling',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Run a poll in this channel.')
        .addStringOption((opt) => opt
          .setName('prompt')
          .setDescription('The question or statement users will vote on')
          .setMaxLength(256)
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('option-one')
          .setDescription('First option in the poll')
          .setMaxLength(70)
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('option-two')
          .setDescription('Second option in the poll')
          .setMaxLength(70)
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('option-three')
          .setDescription('Third option in the poll')
          .setMaxLength(70)
          .setRequired(false))
        .addStringOption((opt) => opt
          .setName('option-four')
          .setDescription('Fourth option in the poll')
          .setMaxLength(70)
          .setRequired(false))
        .addStringOption((opt) => opt
          .setName('option-five')
          .setDescription('Fifth option in the poll')
          .setMaxLength(70)
          .setRequired(false))
        .setDMPermission(false),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (
          !permissions.has(PermissionsBitField.Flags.SendMessages) ||
          !permissions.has(PermissionsBitField.Flags.AddReactions)
        ) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Send Messages, Add Reactions)',
            ephemeral: true,
          });
        }

        const prompt = interaction.options.getString('prompt');
        const optionOne = interaction.options.getString('option-one');
        const optionTwo = interaction.options.getString('option-two');
        const optionThree = interaction.options.getString('option-three', false) ?? null;
        const optionFour = interaction.options.getString('option-four', false) ?? null;
        const optionFive = interaction.options.getString('option-five', false) ?? null;

        const optionReactions = ['🇦', '🇧', '🇨', '🇩', '🇪'];
        const options = [optionOne, optionTwo];
        if (optionThree) { options.push(optionThree); }
        if (optionFour) { options.push(optionFour); }
        if (optionFive) { options.push(optionFive); }

        let description = '';
        for (let i=0; i < options.length; ++i) {
          description += `${optionReactions[i]}  ${options[i]}\n\n`;
        }

        const embed = new EmbedBuilder()
          .setColor('#6081cb')
          .setTitle(prompt)
          .setDescription(description);

        await interaction.reply({ embeds: [embed] });
        const pollMessage = await interaction.fetchReply();

        for (let i=0; i < options.length; ++i) {
          await pollMessage.react(optionReactions[i]);
        }
      },
    },
  ],
};
