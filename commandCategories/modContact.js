const { dbQueryOne, dbExecute } = require('../lib');
const { ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ActionRowBuilder,
  SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'Mod Contact',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('modContactEnable')
        .setDescription('Enable the Mod Contact feature in a Discord server. This will create a category ' +
          'containing a single channel with a message where users can click on a button to contact the mods.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        // If the Mod Contact feature has already been enabled for this guild, do nothing
        let guildDataId = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', interaction.guildId);
        guildDataId = guildDataId.id;

        const existing = await dbQueryOne('SELECT 1 FROM mod_contact WHERE guildDataId=?', [guildDataId]);
        if (existing) {
          return interaction.reply('The Mod Contact feature is already enabled for this server!');
        }

        // Create a category to contain the report channels
        const category = await interaction.guild.channels.create({
          name: 'Mod Contact',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              // @everyone may not send messages or add reactions
              id: interaction.guildId,
              deny: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions ],
            },
            {
              // @AginahBot may post in this category
              id: interaction.client.user.id,
              allow: [ PermissionsBitField.Flags.SendMessages ],
            },
          ],
        });

        const channel = await interaction.guild.channels.create({
          name: 'mod-contact',
          type: ChannelType.GuildText,
          topic: 'Privately contact the moderator team.',
          parent: category.id,
          permissionOverwrites: [
            {
              // @everyone may not send messages or add reactions
              id: interaction.guildId,
              deny: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions ],
            },
            {
              // @AginahBot may post in this channel
              id: interaction.client.user.id,
              allow: [ PermissionsBitField.Flags.SendMessages ],
            },
          ],
        });

        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Contact Moderators')
            .setStyle(ButtonStyle.Primary)
            .setCustomId('mod-contact')
        );

        const contactMessage = await channel.send({
          content: 'If you need to contact the moderators, simply click the button below. A private ' +
                      'channel visible only to you and the moderators will be created. Your conversation will be ' +
                      'confidential.',
          components: [ buttonRow ],
        });

        // Update database with mod_contact data
        let sql = 'INSERT INTO mod_contact (guildDataId, categoryId, channelId, messageId) VALUES (?, ?, ?, ?)';
        await dbExecute(sql, [ guildDataId, category.id, channel.id, contactMessage.id ]);
        return interaction.reply('Mod contact feature enabled.');
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('modContactDisable')
        .setDescription('Remove the Mod Contact feature from a Discord server. This also removes all ' +
          'Mod Contact history.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        // Fetch information about this guild's mod-contact feature
        let sql = `SELECT mc.id, mc.categoryId
                           FROM mod_contact mc
                           JOIN guild_data gd ON mc.guildDataId = gd.id
                           WHERE gd.guildId = ?`;
        const modContact = await dbQueryOne(sql, [ interaction.guildId ]);

        // If the feature isn not enabled, alert the user
        if (!modContact) {
          return interaction.reply('The Mod Contact feature is not enabled for this server.');
        }

        // Delete entries for previous mod contact events
        await dbExecute('DELETE FROM mod_contact_channels WHERE modContactId=?', [ modContact.id ]);

        // Delete the guild category and channels
        const category = await interaction.guild.channels.fetch(modContact.categoryId);
        await category.children.cache.each(async (child) => await child.delete());
        await category.delete();

        await dbExecute('DELETE FROM mod_contact WHERE id=?', [ modContact.id ]);
        return interaction.reply('Mod contact feature disabled.');
      },
    }
  ],
};