const { parseEmoji, dbQueryOne, dbQueryAll, dbExecute, updateCategoryMessage } = require('../lib');
const { ChannelType, PermissionsBitField, SlashCommandBuilder, PermissionFlagsBits,
  MessageFlags, InteractionContextType } = require('discord.js');

module.exports = {
  category: 'Role Requestor',
  commands: [
    {
      longDescription: 'Create a #role-request text channel for users to interact with' +
        'AginahBot and request roles. This channel will be used to post role category messages users can click to ' +
        'to add or remove roles.',
      commandBuilder: new SlashCommandBuilder()
        .setName('role-system-enable')
        .setDescription('Enable the role system on this server.')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT gd.id AS guildDataId, rs.id AS roleSystemId
                    FROM guild_data gd
                    LEFT JOIN role_systems rs ON gd.id = rs.guildDataId
                    WHERE gd.guildId=?`;
        const row = await dbQueryOne(sql, [interaction.guildId]);
        if (!row) { throw new Error(); }
        if (row.roleSystemId) {
          return interaction.reply({
            content: 'The role system has already been set up on your server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        interaction.guild.channels.create({
          name: 'role-request',
          type: ChannelType.GuildText,
          topic: 'Request roles so that you may be pinged for various notifications.',
          reason: 'Role Request system created.',
          permissionOverwrites: [
            {
              id: interaction.client.user.id,
              allow: [ PermissionsBitField.Flags.SendMessages ],
            },
            {
              id: interaction.guild.roles.everyone.id,
              deny: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions ],
            }
          ],
        }).then(async (channel) => {
          // Add role system data to the database
          let sql = 'INSERT INTO role_systems (guildDataId, roleRequestChannelId) VALUES(?, ?)';
          await dbExecute(sql, [row.guildDataId, channel.id]);
          channel.send('The following roles are available on this server. If you would like to be ' +
              'assigned a role, please click the button with the indicated ' +
              'emoji. By default, all roles are pingable by everyone on the server. Remember, with great ' +
              'power comes great responsibility.');
          return interaction.followUp({
            content: 'Role system enabled.',
            flags: MessageFlags.Ephemeral,
          });
        }).catch((e) => {
          console.error(e);
          return interaction.followUp('Something went wrong and the role system could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-system-disable')
        .setDescription('Delete the role-request channel and all categories and permissions created by this bot.')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT rs.id, rs.roleRequestChannelId FROM role_systems rs
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [interaction.guildId]);
        if (!roleSystem) {
          // If the role system does not exist, there is no need to attempt to delete it
          return interaction.reply({
            content: 'The role system is not currently installed on this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try{
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Loop over the role categories and delete them
          sql = 'SELECT id FROM role_categories WHERE roleSystemId=?';
          const roleCategories = await dbQueryAll(sql, [roleSystem.id]);
          for (let roleCategory of roleCategories) {
            // Loop over the roles in each category and delete them from the server
            const roles = await dbQueryAll('SELECT roleId FROM roles WHERE categoryId=?', [roleCategory.id]);
            for (let role of roles) {
              await interaction.guild.roles.resolve(role.roleId).delete();
            }
            await dbExecute('DELETE FROM roles WHERE categoryId=?', [roleCategory.id]);
          }

          // Database cleanup
          await dbExecute('DELETE FROM role_categories WHERE roleSystemId=?', [roleSystem.id]);
          interaction.guild.channels.resolve(roleSystem.roleRequestChannelId).delete();
          await dbExecute('DELETE FROM role_systems WHERE id=?', [roleSystem.id]);
          return interaction.followUp('Role system disabled.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role system could not be destroyed.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      longDescription: 'Create a category for roles to be added to. Each category will have its own message ' +
        'in the #role-request channel. Category names must be a single alphanumeric word.',
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-create')
        .setDescription('Create a role category.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the new category')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');

        let sql = `SELECT rs.id, rs.roleRequestChannelId
                   FROM role_systems rs
                   JOIN guild_data gd ON rs.guildDataId=gd.id
                   WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [interaction.guildId]);
        if (!roleSystem) {
          return interaction.reply({
            content: 'The role system has not been setup on this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        sql = `SELECT 1 FROM role_categories rc
               JOIN role_systems rs ON rc.roleSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE gd.guildId=?
                 AND rc.categoryName=?`;
        const row = await dbQueryOne(sql, [interaction.guildId, categoryName]);
        if (row) {
          return interaction.reply({
            content: 'That role category already exists!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Add the category message to the #role-request channel
          interaction.guild.channels.resolve(roleSystem.roleRequestChannelId).send('Creating new category...')
            .then(async (categoryMessage) => {
              // Update database with new category message data
              let sql = 'INSERT INTO role_categories (roleSystemId, categoryName, messageId) VALUES (?, ?, ?)';
              await dbExecute(sql, [roleSystem.id, categoryName, categoryMessage.id]);
              await updateCategoryMessage(interaction.client, interaction.guild, categoryMessage.id);
              return interaction.followUp(`Created role category: ${categoryName}.`);
            });
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role category could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-rename')
        .setDescription('Change the name of a role category.')
        .addStringOption((opt) => opt
          .setName('old-name')
          .setDescription('Current name of the category you wish to rename')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('new-name')
          .setDescription('New name of the category')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction){
        const oldName = interaction.options.getString('old-name');
        const newName = interaction.options.getString('new-name');

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Find a matching role category
          let sql = `SELECT rc.id, rc.messageId
                     FROM guild_data gd
                     JOIN role_systems rs ON rs.guildDataId = gd.id
                     JOIN role_categories rc ON rc.roleSystemId = rs.id
                     WHERE gd.guildId=?
                       AND rc.categoryName=?`;
          const categoryData = await dbQueryOne(sql, [interaction.guildId, oldName]);
          if (!categoryData) {
            return interaction.followUp('That role category does not exist!');
          }

          await dbExecute('UPDATE role_categories SET categoryName=? WHERE id=?', [newName, categoryData.id]);
          await updateCategoryMessage(interaction.client, interaction.guild, categoryData.messageId);
          return interaction.followUp(`Role category renamed from ${oldName} to ${newName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role category could not be renamed.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-delete')
        .setDescription('Delete a role category. All roles within this category will also be deleted.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category you wish to delete')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');

        // Get the role category data
        let sql = `SELECT rc.id, rc.messageId, rs.roleRequestChannelId
                   FROM role_categories rc
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?`;
        const roleCategory = await dbQueryOne(sql, [interaction.guildId, categoryName]);
        if (!roleCategory) {
          return interaction.reply({
            content: 'That category does not exist!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const roles = await dbQueryAll('SELECT roleId FROM roles WHERE categoryId=?', [roleCategory.id]);
          for (const roleObj of roles) {
            const role = await interaction.guild.roles.fetch(roleObj.roleId);
            await role.delete();
          }

          await dbExecute('DELETE FROM roles WHERE categoryId=?', [roleCategory.id]);
          await dbExecute('DELETE FROM role_categories WHERE id=?', [roleCategory.id]);
          const roleRequestChannel = interaction.guild.channels.resolve(roleCategory.roleRequestChannelId);
          const categoryMessage = await roleRequestChannel.messages.fetch(roleCategory.messageId);
          await categoryMessage.delete();
          return interaction.followUp(`Role category ${categoryName} deleted.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role category could not be deleted.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-refresh')
        .setDescription('Refresh a role category. Useful if you have manually changed a role\'s name')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category you wish to delete')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');

        try {
          // Get the role category data
          let sql = `SELECT rc.messageId
                     FROM role_categories rc
                     JOIN role_systems rs ON rc.roleSystemId = rs.id
                     JOIN guild_data gd ON rs.guildDataId = gd.id
                     WHERE gd.guildId=?
                       AND rc.categoryName=?`;
          const roleCategory = await dbQueryOne(sql, [interaction.guildId, categoryName]);
          if (!roleCategory) {
            return interaction.reply({
              content: 'That category does not exist!',
              flags: MessageFlags.Ephemeral,
            });
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await updateCategoryMessage(interaction.client, interaction.guild, roleCategory.messageId);
          await interaction.followUp({
            content: `Category ${categoryName} has been refreshed.`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role category could not be deleted.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-create')
        .setDescription('Create a pingable role.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('The category your new role should be placed into')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('role-name')
          .setDescription('The name of the role you wish to create')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('reaction')
          .setDescription('The emoji you wish to associate with this role')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('description')
          .setDescription('An optional description to associate with the role')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const roleName = interaction.options.getString('role-name');
        const reaction = interaction.options.getString('reaction');
        const description = interaction.options.getString('description', false) ?? null;

        // Check for existing role
        let sql = `SELECT 1 FROM roles r
                   JOIN role_categories rc ON r.categoryId = rc.id
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleName=?`;
        const row = await dbQueryOne(sql, [interaction.guildId, categoryName, roleName]);
        // If the role already exists, do nothing
        if (row) {
          return await interaction.reply({
            content: 'That role already exists!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Verify the requested emoji is available on this server
          const emoji = await parseEmoji(interaction.guild, reaction, true);
          if (!emoji) {
            return interaction.followUp({
              content: 'That emoji is not available on this server!',
              flags: MessageFlags.Ephemeral,
            });
          }

          // Verify the requested category exists
          sql = `SELECT rc.id, rc.messageId, rs.roleRequestChannelId FROM role_categories rc
                 JOIN role_systems rs ON rc.roleSystemId = rs.id
                 JOIN guild_data gd ON rs.guildDataId = gd.id
                 WHERE gd.guildId=?
                   AND rc.categoryName=?`;
          const roleCategory = await dbQueryOne(sql, [interaction.guildId, categoryName]);
          // If there is no such category, warn the user and do nothing
          if (!roleCategory) {
            return interaction.followUp('That category doesn\'t exist!');
          }

          // Prevent adding more than twelve roles in a single category
          sql = `SELECT COUNT(*) AS count
                 FROM roles r
                 JOIN role_categories rc ON r.categoryId = rc.id
                 JOIN role_systems rs ON rc.roleSystemId = rs.id
                 JOIN guild_data gd ON rs.guildDataId = gd.id
                 WHERE gd.guildId=?
                   AND rc.categoryName=?`;
          let roleCount = await dbQueryOne(sql, [interaction.guildId, categoryName]);
          if (roleCount.count >= 12) {
            return interaction.followUp({
              content: 'A role category may not exceed twelve (12) roles.',
              flags: MessageFlags.Ephemeral,
            });
          }

          // Create the role on the server
          const role = await interaction.guild.roles.create({
            name: roleName,
            mentionable: true,
            reason: 'Added as part of role-request system.',
          });

          // Add the role to the database
          await dbExecute(
            'INSERT INTO roles (categoryId, roleId, roleName, reaction, reactionString, description) VALUES (?, ?, ?, ?, ?, ?)',
            [roleCategory.id, role.id, roleName, (emoji.id || emoji), emoji.toString(), description]
          );
          await updateCategoryMessage(interaction.client, interaction.guild, roleCategory.messageId);
          return interaction.followUp(`Created role ${roleName} in the ${categoryName} category.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role could not be created.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-rename')
        .setDescription('Change the name of a role')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category containing the target role')
          .setRequired(true))
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('Current role you wish to rename')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('new-name')
          .setDescription('The new name of the role')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction){
        const categoryName = interaction.options.getString('category-name');
        const role = interaction.options.getRole('role');
        const newName = interaction.options.getString('new-name');

        let sql = `SELECT r.id, r.roleId, rc.messageId
                   FROM guild_data gd
                   JOIN role_systems rs ON rs.guildDataId = gd.id
                   JOIN role_categories rc ON rc.roleSystemId = rs.id
                   JOIN roles r ON r.categoryId = rc.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleId=?`;
        const roleData = await dbQueryOne(sql, [interaction.guildId, categoryName, role.id]);
        if (!roleData) {
          return interaction.reply({
            content: 'That role does not exist in the specified guild/category!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Update role name in the database
          await dbExecute('UPDATE roles SET roleName=? WHERE id=?', [newName, roleData.id]);

          // Update role on Discord
          const oldName = role.name;
          await interaction.guild.roles.edit(role.id.toString(), { name: newName });

          // Update the category message to display the new role name
          await updateCategoryMessage(interaction.client, interaction.guild, roleData.messageId);
          return interaction.followUp(`Renamed role ${oldName} to ${newName} in category ${categoryName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role could not be renamed.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-reaction-change')
        .setDescription('Alter the reaction associated with a role')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category containing the target role')
          .setRequired(true))
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('Role you wish to change the reaction for')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('reaction')
          .setDescription('New reaction to associate with the role')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const role = interaction.options.getRole('role');
        const reaction = interaction.options.getString('reaction');

        // Check for existing role
        let sql = `SELECT r.id, rc.messageId, rs.roleRequestChannelId, r.reaction
                   FROM roles r
                   JOIN role_categories rc ON r.categoryId = rc.id
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleId=?`;
        const roleData = await dbQueryOne(sql, [interaction.guildId, categoryName, role.id]);

        // If the role does not exist, inform the user
        if (!roleData) {
          return interaction.reply({
            content: 'That role does not exist!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Verify the requested emoji is available on this server
          const emoji = await parseEmoji(interaction.guild, reaction, true);
          if (!emoji) {
            return interaction.followUp('That emoji is not available on this server!');
          }

          await dbExecute('UPDATE roles SET reaction=?, reactionString=? WHERE id=?',
            [(emoji.id || emoji), emoji.toString(), roleData.id]);
          await updateCategoryMessage(interaction.client, interaction.guild, roleData.messageId);
          return interaction.followUp({
            content: `Role \`${role.name}\` reaction updated to ${reaction} in category \`${categoryName}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role reaction could not be changed.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-description-change')
        .setDescription('Alter the description associated with a role')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category containing the target role')
          .setRequired(true))
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('Role you wish to change the description of')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('description')
          .setDescription('New description for the role')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const role = interaction.options.getRole('role');
        const description = interaction.options.getString('description', false) ?? null;

        // Check for existing role
        let sql = `SELECT r.id, rc.messageId, rs.roleRequestChannelId FROM roles r
                   JOIN role_categories rc ON r.categoryId = rc.id
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleId=?`;
        const roleData = await dbQueryOne(sql, [interaction.guildId, categoryName, role.id]);
        if (!roleData) {
          return interaction.reply({
            content: 'That role does not exist in this guild/category!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await dbExecute('UPDATE roles SET description=? WHERE id=?', [description, roleData.id]);
          await updateCategoryMessage(interaction.client, interaction.guild, roleData.messageId);
          return interaction.followUp(`Updated description for role ${role.name} in category ${categoryName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role description could not be changed.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-delete')
        .setDescription('Delete a role in the role request system.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category containing the target role')
          .setRequired(true))
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('Name of the role you wish to delete')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const role = interaction.options.getRole('role');

        let sql = `SELECT r.id, rc.id AS categoryId, rc.messageId, r.reaction, r.roleId, rs.roleRequestChannelId
                   FROM roles r
                   JOIN role_categories rc ON r.categoryId = rc.id
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleId=?`;
        const roleData = await dbQueryOne(sql, [interaction.guildId, categoryName, role.id]);
        if (!roleData) {
          return interaction.reply({
            content: 'That role does not exist in this guild/category!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Remove the role from the guild
          await interaction.guild.roles.resolve(roleData.roleId).delete();

          // Delete rows from the roles table and update role category message
          await dbExecute('DELETE FROM roles WHERE id=? AND categoryId=?', [roleData.id, roleData.categoryId]);
          await updateCategoryMessage(interaction.client, interaction.guild, roleData.messageId);
          return interaction.followUp(`Deleted role ${role.name} from category ${categoryName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the role could not be deleted.\n' +
            'Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      }
    },
  ],
};
