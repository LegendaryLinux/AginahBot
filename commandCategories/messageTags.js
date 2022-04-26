const { dbQueryOne, dbQueryAll, dbExecute } = require('../lib');

module.exports = {
    category: 'Message Tags',
    commands: [
        {
            name: 'set-tag',
            description: 'Add or update a &tag for a server.',
            longDescription: 'Add or update a tag for a server. If a user includes this tag in any part of ' +
              'a message, the bot will respond with the content of this tag. Tags may contain only letters, ' +
              'numbers, and underscores.',
            aliases: [],
            usage: '`!aginah set-tag tagName content`',
            moderatorRequired: true,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                if (args.length < 2) {
                    return message.channel.send('Invalid arguments provided. See `!aginah help set-tag`.');
                }

                // Tags may contain only alphanumeric characters
                if (args[0].search(/\W/) > -1) {
                    return message.channel.send('Tag names may contain only letters, numbers, and underscores.');
                }

                // The full message after the tag name should be used at the tag's content. Remove the tag name
                // and trim the remaining text from the message.
                const tagContent = message.content.substring(message.content.search(args[0]) + args[0].length);

                // Fetch guildDataId
                const guildData = await dbQueryOne(`SELECT id FROM guild_data WHERE guildId=?`, [message.guild.id]);

                // Save new tag to database
                let sql = `REPLACE INTO message_tags (guildDataId, tagName, tagContent, createdByUserId)
                           VALUES (?,?,?,?)`;
                await dbExecute(sql, [guildData.id, args[0].toLowerCase(), tagContent, message.member.id]);

                return message.channel.send(`Set content for tag \`${args[0].toLowerCase()}\`.`);
            },
        },
        {
            name: 'delete-tag',
            description: 'Remove a &tag from a server.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah delete-tag tagName`',
            moderatorRequired: true,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                if (args.length < 1) {
                    return message.channel.send('Invalid arguments provided. See `!aginah help delete-tag`.');
                }

                // Fetch guildDataId
                const guildData = await dbQueryOne(`SELECT id FROM guild_data WHERE guildId=?`, [message.guild.id]);
                if (!guildData) {
                    return message.channel.send('That tag does not exist on this server.');
                }

                // If the tag does not exist, inform the user
                let sql = `SELECT 1
                           FROM message_tags mt
                           JOIN guild_data gd ON mt.guildDataId = gd.id
                           WHERE gd.guildId=?
                            AND mt.tagName=?`;
                const existing = await dbQueryOne(sql, [message.guild.id, args[0].toLowerCase()]);
                if (!existing) {
                    return message.channel.send('That tag does not exist on this server.');
                }

                // Delete the tag from the database
                await dbExecute(`DELETE FROM message_tags WHERE guildDataId=? AND tagName=?`,
                  [guildData.id, args[0].toLowerCase()]
                );

                return message.channel.send(`Deleted tag \`${args[0].toLowerCase()}\`.`);
            }
        },
        {
            name: 'tags',
            description: 'List all &tags available on this server.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah tags',
            moderatorRequired: false,
            adminOnly: false,
            guildOnly: true,
            async execute(message, args) {
                // Fetch guild tags
                let sql = `SELECT mt.tagName
                           FROM message_tags mt
                           JOIN guild_data gd ON mt.guildDataId = gd.id
                           WHERE gd.guildId=?`;
                const tags = await dbQueryAll(sql, [message.guild.id]);

                // If there are no tags available for this guild, inform the user
                if (tags.length === 0) {
                    return message.channel.send('There are currently no tags available on this server.');
                }

                // Build a string containing all the tag names surrounded by backticks
                let tagString = '';
                tags.forEach((tag) => tagString += `\`${tag.tagName}\`, `);
                tagString = tagString.slice(0, -2);

                // Send the list of tags to the user
                return message.channel.send(`The following tags are available on this server:\n${tagString}`);
            }
        }
    ],
};
