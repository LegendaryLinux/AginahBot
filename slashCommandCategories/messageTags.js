const { dbQueryOne, dbQueryAll, dbExecute } = require('../lib');
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  category: 'Message Tags',
  commands: [
    {
      longDescription: 'Add or update a tag for a server. If a user includes this tag in any part of ' +
        'a message, the bot will respond with the content of this tag. Tags may contain only letters, ' +
        'numbers, and underscores.',
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-add')
        .setDescription('Add or update a tag for this server.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('The tag to respond to')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('content')
          .setDescription('The text which will be displayed when a tag is found in a message')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name');
        const content = interaction.options.getString('content');

        // Tags may contain only alphanumeric characters
        if (tagName.search(/\W/) > -1) {
          return interaction.reply({
            content: 'Tag names may contain only letters, numbers, and underscores.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: 'Uh-oh. Something is weird in my database. Please report this bug at:\n' +
              'https://discord.gg/2EZNrAw9Ja.\n\nPaste this error message into the `#bug-reports` channel:\n' +
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\``,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Save new tag to database
        let sql = `REPLACE INTO message_tags (guildDataId, tagName, tagContent, createdByUserId)
                           VALUES (?,?,?,?)`;
        await dbExecute(sql, [guildData.id, tagName.toLowerCase(), content, interaction.user.id]);

        return interaction.reply({
          content: `Set content for tag \`${tagName.toLowerCase()}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-delete')
        .setDescription('Remove a &tag from a server.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('Name of the tag to be removed.')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name');

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: 'Uh-oh. Something is weird in my database. Please report this bug at:\n' +
              'https://discord.gg/2EZNrAw9Ja.\n\nPaste this error message into the `#bug-reports` channel:\n' +
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\``,
            flags: MessageFlags.Ephemeral,
          });
        }

        // If the tag does not exist, inform the user
        let sql = `SELECT 1
                   FROM message_tags mt
                   JOIN guild_data gd ON mt.guildDataId = gd.id
                   WHERE gd.guildId=?
                    AND mt.tagName=?`;
        const existing = await dbQueryOne(sql, [interaction.guildId, tagName.toLowerCase()]);
        if (!existing) {
          return interaction.reply({
            content: 'That tag does not exist on this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Delete the tag from the database
        await dbExecute('DELETE FROM message_tags WHERE guildDataId=? AND tagName=?',
          [guildData.id, tagName.toLowerCase()]
        );

        return interaction.reply({
          content: `Deleted tag \`${tagName.toLowerCase()}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-list')
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
