const { dbQueryOne, dbExecute } = require('../lib');
const { ChannelType, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const VOICE_CHANNEL_NAME = 'Create Room';

module.exports = {
  category: 'Dynamic Room Systems',
  commands: [
    {
      longDescription: 'Add a dynamic room system to this server. It will automatically create voice and text ' +
        'channels on demand.',
      commandBuilder: new SlashCommandBuilder()
        .setName('room-system-create')
        .setDescription('Add a dynamic room system to this server.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Category name for the new room system')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (
          !permissions.has(PermissionFlagsBits.ManageChannels) ||
          !permissions.has(PermissionFlagsBits.ManageRoles)
        ) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Channels, Manage Roles)',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Create the system
        const categoryName = interaction.options.getString('category-name');

        try {
          // Several requests are made, and it might take a few seconds
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const category = await interaction.guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory
          });
          const voiceChannel = await interaction.guild.channels.create({
            name: VOICE_CHANNEL_NAME,
            type: ChannelType.GuildVoice,
            parent: category
          });

          const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
          let sql = 'INSERT INTO room_systems (guildDataId, channelCategoryId, newGameChannelId) VALUES (?, ?, ?)';
          await dbExecute(sql, [guildData.id, category.id, voiceChannel.id]);
          return interaction.followUp(`Created room system ${categoryName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the room system could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('room-system-destroy')
        .setDescription('Remove a dynamic room system system from this server.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Category name of the room system you wish to destroy')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (
          !permissions.has(PermissionFlagsBits.ManageChannels) ||
          !permissions.has(PermissionFlagsBits.ManageRoles)
        ) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Channels, Manage Roles)',
            flags: MessageFlags.Ephemeral,
          });
        }

        const categoryName = interaction.options.getString('category-name');

        try {
          // Several requests are made, and it might take a few seconds
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const guild = await interaction.guild.fetch();
          // Find a category whose name matches the argument
          const category = guild.channels.cache.find((el) => el.name === categoryName);

          // If no category matching the provided argument was found, inform the user
          if (!category) { return interaction.followUp('No category with that name exists!'); }

          let sql = `SELECT rs.id
                     FROM room_systems rs
                     JOIN guild_data gd ON rs.guildDataId = gd.id
                     WHERE channelCategoryId=?
                       AND gd.guildId=?`;
          const row = await dbQueryOne(sql, [category.id, interaction.guildId]);
          if (!row) {
            return interaction.followUp('That category is not a dynamic room category.');
          }

          await category.children.cache.each(async (channel) => await channel.delete());
          await category.delete();
          await dbExecute('DELETE FROM room_system_channels WHERE roomSystemId=?', [row.id]);
          await dbExecute('DELETE FROM room_systems WHERE id=?', [row.id]);
          return interaction.followUp(`Destroyed dynamic room system ${categoryName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the room system could not be deleted.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
  ],
};
