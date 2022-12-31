const { dbQueryOne, dbQueryAll, dbExecute } = require('../lib');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'Message Tags',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tagAdd')
        .setDescription('Add or update a tag for a server. If a user includes this tag in any part of ' +
          'a message, the bot will respond with the content of this tag. Tags may contain only letters, ' +
          'numbers, and underscores.')
        .addStringOption((opt) => opt
          .setName('tagName')
          .setDescription('The tag to respond to')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('content')
          .setDescription('The text which will be displayed when a tag is found in a message')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const tagName = interaction.options.getString('tagName');
        const content = interaction.options.getString('content');

        // Tags may contain only alphanumeric characters
        if (tagName.search(/\W/) > -1) {
          return interaction.reply('Tag names may contain only letters, numbers, and underscores.');
        }

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);

        // Save new tag to database
        let sql = `REPLACE INTO message_tags (guildDataId, tagName, tagContent, createdByUserId)
                           VALUES (?,?,?,?)`;
        await dbExecute(sql, [guildData.id, tagName.toLowerCase(), content, interaction.user.id]);

        return interaction.reply(`Set content for tag \`${tagName.toLowerCase()}\`.`);
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tagDelete')
        .setDescription('Remove a &tag from a server.')
        .addStringOption((opt) => opt
          .setName('tagName')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const tagName = interaction.options.getString('tagName');

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply('That tag does not exist on this server.');
        }

        // If the tag does not exist, inform the user
        let sql = `SELECT 1
                   FROM message_tags mt
                   JOIN guild_data gd ON mt.guildDataId = gd.id
                   WHERE gd.guildId=?
                    AND mt.tagName=?`;
        const existing = await dbQueryOne(sql, [interaction.guildId, tagName.toLowerCase()]);
        if (!existing) {
          return interaction.reply('That tag does not exist on this server.');
        }

        // Delete the tag from the database
        await dbExecute('DELETE FROM message_tags WHERE guildDataId=? AND tagName=?',
          [guildData.id, tagName.toLowerCase()]
        );

        return interaction.reply(`Deleted tag \`${tagName.toLowerCase()}\`.`);
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tagList')
        .setDescription('List all &tags available on this server.')
        .setDMPermission(false),
      async execute(interaction) {
        // Fetch guild tags
        let sql = `SELECT mt.tagName
                   FROM message_tags mt
                   JOIN guild_data gd ON mt.guildDataId = gd.id
                   WHERE gd.guildId=?`;
        const tags = await dbQueryAll(sql, [interaction.guildId]);

        // If there are no tags available for this guild, inform the user
        if (tags.length === 0) {
          return interaction.reply('There are currently no tags available on this server.');
        }

        // Build a string containing all the tag names surrounded by backticks
        let tagString = '';
        tags.forEach((tag) => tagString += `\`${tag.tagName}\`, `);
        tagString = tagString.slice(0, -2);

        // Send the list of tags to the user
        return interaction.reply(`The following tags are available on this server:\n${tagString}`);
      }
    }
  ],
};
