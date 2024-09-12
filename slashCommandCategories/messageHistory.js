const { SlashCommandBuilder, ChannelType, PermissionsBitField} = require('discord.js');
const {dbQueryOne, dbExecute, getModeratorRole} = require('../lib');

module.exports = {
  category: 'Message History',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('message-history-enable')
        .setDescription('Create a channel to log deleted messages.')
        .setDMPermission(false)
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
            ephemeral: true,
          });
        }

        await interaction.deferReply({ephemeral: true});
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
          ephemeral: true,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('message-history-disable')
        .setDescription('Delete an existing message history channel.')
        .setDMPermission(false)
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
            ephemeral: true,
          });
        }

        await interaction.deferReply({ephemeral: true});

        // Delete the message history channel
        await interaction.guild.channels.delete(options.messageHistoryChannelId);

        // Clean up database
        await dbExecute(
          'UPDATE guild_options SET messageHistoryChannelId=NULL WHERE id=?',
          [options.id],
        );

        return interaction.followUp({
          content: 'Message history channel deleted.',
          ephemeral: true,
        });
      }
    }
  ],
};
