const { SlashCommandBuilder, ChannelType, PermissionsBitField, MessageFlags, InteractionContextType } = require('discord.js');
const {dbQueryOne, dbExecute, getModeratorRole} = require('../lib');

module.exports = {
  category: 'Message History',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('message-history-enable')
        .setDescription('Create a channel to log edited and deleted messages.')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT go.id, go.messageHistoryChannelId
                   FROM guild_options go
                   JOIN guild_data gd ON go.guildDataId = gd.id
                   WHERE gd.guildId=?`;
        const options = await dbQueryOne(sql, [interaction.guild.id]);
        if (options?.messageHistoryChannelId) {
          return interaction.reply({
            content: `Message history is already enabled for this guild in <#${options.messageHistoryChannelId}>.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({flags: MessageFlags.Ephemeral});
        const moderatorRole = await getModeratorRole(interaction.guild);
        const messageHistoryChannel = await interaction.guild.channels.create({
          name: 'message-history',
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              // @everyone may not view this channel
              id: interaction.guild.id,
              deny: [ PermissionsBitField.Flags.ViewChannel ],
            },
            {
              // Moderators may view this channel
              id: moderatorRole.id,
              allow: [ PermissionsBitField.Flags.ViewChannel ],
            },
            {
              // @AginahBot may view this channel
              id: interaction.client.user.id,
              allow: [ PermissionsBitField.Flags.ViewChannel ],
            }
          ]
        });

        await dbExecute(
          'UPDATE guild_options SET messageHistoryChannelId=? WHERE id=?',
          [messageHistoryChannel.id, options.id]
        );

        return interaction.followUp({
          content: `${messageHistoryChannel} has been created.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('message-history-disable')
        .setDescription('Delete an existing message history channel.')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT go.id, go.messageHistoryChannelId
                   FROM guild_options go
                   JOIN guild_data gd ON go.guildDataId = gd.id
                   WHERE gd.guildId=?`;
        const options = await dbQueryOne(sql, [interaction.guild.id]);
        if (!options?.messageHistoryChannelId) {
          return interaction.reply({
            content: 'Message history is not enabled for this guild.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({flags: MessageFlags.Ephemeral});

        // Delete the message history channel
        await interaction.guild.channels.delete(options.messageHistoryChannelId);

        // Clean up database
        await dbExecute(
          'UPDATE guild_options SET messageHistoryChannelId=NULL WHERE id=?',
          [options.id],
        );

        return interaction.followUp({
          content: 'Message history channel deleted.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  ],
};
