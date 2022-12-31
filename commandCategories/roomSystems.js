const { dbQueryOne, dbExecute } = require('../lib');
const { ChannelType, SlashCommandBuilder } = require('discord.js');

const VOICE_CHANNEL_NAME = 'Create Room';

module.exports = {
  category: 'Dynamic Room Systems',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('roomSystemCreate')
        .setDescription('Add a dynamic room system to this server. It will automatically create voice and text ' +
          'channels on demand.')
        .addStringOption((opt) => opt
          .setName('categoryName')
          .setDescription('Category name for the new room system')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        // Create the system
        const categoryName = interaction.options.getString('categoryName');
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
        return interaction.reply(`Created room system ${categoryName}.`);
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('roomSystemDestroy')
        .setDescription('Remove a role system system from this server.')
        .addStringOption((opt) => opt
          .setName('categoryName')
          .setDescription('Category name of the room system you wish to destroy')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const categoryName = interaction.options.getString('categoryName');

        const guild = await interaction.guild.fetch();
        // Find a category whose name matches the argument
        const category = guild.channels.cache.find((el) => el.name === categoryName);

        // If no category matching the provided argument was found, inform the user
        if (!category) { return interaction.reply('No dynamic room category with that name exists!'); }

        let sql = `SELECT rs.id
                   FROM room_systems rs
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE channelCategoryId=?
                     AND gd.guildId=?`;
        const row = await dbQueryOne(sql, [category.id, interaction.guildId]);
        if (!row) {
          return interaction.reply('Your server does not have a dynamic room category with that name.');
        }

        await category.children.cache.each(async (channel) => await channel.delete());
        await category.delete();
        await dbExecute('DELETE FROM room_system_games WHERE roomSystemId=?', [row.id]);
        await dbExecute('DELETE FROM room_systems WHERE id=?', [row.id]);
        return interaction.reply(`Destroyed room system ${categoryName}.`);
      }
    },
  ],
};
