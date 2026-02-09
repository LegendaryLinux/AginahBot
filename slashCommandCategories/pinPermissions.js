const { SlashCommandBuilder, PermissionsBitField, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { dbExecute, dbQueryOne, verifyModeratorRole, dbQueryAll} = require('../lib');

module.exports = {
  category: 'Pin Permissions',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin-grant')
        .setDescription('Grant a user permission to pin messages in a specified channel')
        .addUserOption((opt) => opt
          .setName('user')
          .setDescription('User to grant pin permission for')
          .setRequired(true))
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel to grant pin permissions in. Defaults to the current channel')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const channel = interaction.options.getChannel('channel', false) ?? interaction.channel;
        const user = interaction.options.getUser('user', true);

        if (!channel.isTextBased() || channel.isVoiceBased()) {
          return interaction.reply({
            content: 'The given channel must be a text channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('REPLACE INTO pin_permissions (guildDataId, channelId, userId) VALUES (?, ?, ?)', [
          guildData.id, channel.id, user.id
        ]);

        return interaction.reply({
          content: 'Permission granted.',
          flags: MessageFlags.Ephemeral,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin-revoke')
        .setDescription('Revoke permission for a user to pin messages in a specified channel')
        .addUserOption((opt) => opt
          .setName('user')
          .setDescription('User to revoke pin permission for')
          .setRequired(true))
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel to revoke pin permissions in. Defaults to the current channel')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const channel = interaction.options.getChannel('channel', false) ?? interaction.channel;
        const user = interaction.options.getUser('user', true);

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('DELETE FROM pin_permissions WHERE guildDataId=? AND channelId=? AND userId=?', [
          guildData.id, channel.id, user.id
        ]);

        return interaction.reply({
          content: 'Permission revoked.',
          flags: MessageFlags.Ephemeral,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin')
        .setDescription('Pin a message in this channel.')
        .addStringOption((opt) => opt
          .setName('message')
          .setDescription('The ID of or link to the message to pin.')
          .setMaxLength(512)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (!permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Messages)',
            flags: MessageFlags.Ephemeral,
          });
        }

        let messageId = interaction.options.getString('message');
        if (/.*discord.*\/\d+$/.test(messageId)) {
          const output = messageId.match(/.*discord.*\/(\d+)$/);
          messageId = output[1];
        }

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            flags: MessageFlags.Ephemeral,
          });
        }

        let sql = 'SELECT 1 FROM pin_permissions WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to pin messages in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (!message.pinned) {
            await message.pin();
            return interaction.reply({
              content: 'Message pinned.',
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.reply({
            content: 'That message is already pinned.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              flags: MessageFlags.Ephemeral,
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
          .setName('message')
          .setDescription('The ID of or link to the message to unpin.')
          .setMaxLength(512)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (!permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Messages)',
            flags: MessageFlags.Ephemeral,
          });
        }

        let messageId = interaction.options.getString('message');
        if (/.*discord.*\/\d+$/.test(messageId)) {
          const output = messageId.match(/.*discord.*\/(\d+)$/);
          messageId = output[1];
        }

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            flags: MessageFlags.Ephemeral,
          });
        }

        let sql = 'SELECT 1 FROM pin_permissions WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to unpin messages in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (message.pinned) {
            await message.unpin();
            return interaction.reply({
              content: 'Message unpinned.',
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.reply({
            content: 'That message is not pinned.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              flags: MessageFlags.Ephemeral,
            });
          }

          throw err;
        }
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin-list')
        .setDescription('List all users with pin permissions')
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel for which pin grants will be displayed. Defaults to current channel.')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            flags: MessageFlags.Ephemeral,
          });
        }

        let sql = '';
        let results = [];
        if (channel) {
          sql = 'SELECT channelId, userId FROM pin_permissions WHERE guildDataId=? AND channelId=?';
          results = await dbQueryAll(sql, [guildData.id, channel.id]);
        } else {
          sql = 'SELECT channelId, userId FROM pin_permissions WHERE guildDataId=?';
          results = await dbQueryAll(sql, [guildData.id]);
        }

        if (results.length === 0) {
          return interaction.reply({
            content: `No users are authorized to pin${channel ? ' in that channel.' : '.'}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        let content = '';
        for (let row of results) {
          content += `<@${row.userId}> is authorized to pin messages in <#${row.channelId}>.\n`;
        }

        return interaction.reply({ content, flags: MessageFlags.Ephemeral });
      },
    },
  ],
};
