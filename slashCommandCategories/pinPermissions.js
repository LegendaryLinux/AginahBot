const { SlashCommandBuilder, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { dbExecute, dbQueryOne, verifyModeratorRole } = require('../lib');

module.exports = {
  category: 'Pin Permissions',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin-grant')
        .setDescription('Grant a user permission to pin messages in a specified channel')
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel to grant pin permissions in')
          .setRequired(true))
        .addUserOption((opt) => opt
          .setName('user')
          .setDescription('User to grant pin permission for')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const channel = interaction.options.getChannel('channel', true);
        const user = interaction.options.getUser('user', true);

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        await dbExecute('REPLACE INTO pin_permissions (guildDataId, channelId, userId) VALUES (?, ?, ?)', [
          guildData.id, channel.id, user.id
        ]);

        return interaction.reply({
          content: 'Permission granted.',
          ephemeral: true,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin-revoke')
        .setDescription('Revoke permission for a user to pin messages in a specified channel')
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel to revoke pin permissions in')
          .setRequired(true))
        .addUserOption((opt) => opt
          .setName('user')
          .setDescription('User to revoke pin permission for')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const channel = interaction.options.getChannel('channel', true);
        const user = interaction.options.getUser('user', true);

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        await dbExecute('DELETE FROM pin_permissions WHERE guildDataId=? AND channelId=? AND userId=?', [
          guildData.id, channel.id, user.id
        ]);

        return interaction.reply({
          content: 'Permission revoked.',
          ephemeral: true,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin')
        .setDescription('Pin a message in this channel.')
        .addStringOption((opt) => opt
          .setName('message-id')
          .setDescription('The ID of the message to pin.')
          .setMaxLength(64)
          .setRequired(true))
        .setDMPermission(false),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (!permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Messages)',
            ephemeral: true,
          });
        }

        const messageId = interaction.options.getString('message-id');

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        let sql = 'SELECT 1 FROM pin_permissions WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to pin messages in this channel.',
            ephemeral: true,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (!message.pinned) {
            await message.pin();
            return interaction.reply({
              content: 'Message pinned.',
              ephemeral: true,
            });
          }

          return interaction.reply({
            content: 'That message is already pinned.',
            ephemeral: true,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              ephemeral: true,
            });
          }

          throw err;
        }
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('unpin')
        .setDescription('Unpin a message in this channel.')
        .addStringOption((opt) => opt
          .setName('message-id')
          .setDescription('The ID of the message to unpin.')
          .setMaxLength(64)
          .setRequired(true))
        .setDMPermission(false),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (!permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Messages)',
            ephemeral: true,
          });
        }

        const messageId = interaction.options.getString('message-id');

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        let sql = 'SELECT 1 FROM pin_permissions WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to unpin messages in this channel.',
            ephemeral: true,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (message.pinned) {
            await message.unpin();
            return interaction.reply({
              content: 'Message unpinned.',
              ephemeral: true,
            });
          }

          return interaction.reply({
            content: 'That message not pinned.',
            ephemeral: true,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              ephemeral: true,
            });
          }

          throw err;
        }
      },
    },
  ],
};
