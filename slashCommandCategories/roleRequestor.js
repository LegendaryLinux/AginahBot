const {generalErrorHandler} = require('../errorHandlers');
const { parseEmoji, dbQueryOne, dbQueryAll, dbExecute } = require('../lib');
const { ChannelType, PermissionsBitField, SlashCommandBuilder } = require('discord.js');

const updateCategoryMessage = async (client, guild, messageId) => {
  // Fetch the target message
  let sql = `SELECT rc.id, rc.categoryName, rs.roleRequestChannelId FROM role_categories rc
             JOIN role_systems rs ON rc.roleSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id
             WHERE gd.guildId=?
               AND rc.messageId=?`;
  const roleCategory = await dbQueryOne(sql, [guild.id, messageId]);
  if (!roleCategory) { throw Error('Unable to update category message. Role category could not be found.'); }

  const roleInfoEmbed = {
    title: roleCategory.categoryName,
    fields: [],
  };
  sql = 'SELECT r.roleId, r.reaction, r.description FROM roles r WHERE r.categoryId=?';
  const roles = await dbQueryAll(sql, [roleCategory.id]);
  roles.forEach((role) => {
    roleInfoEmbed.fields.push({
      name: `${role.reaction} ${guild.roles.resolve(role.roleId).name}`,
      value: role.description || 'No description provided.',
    });
  });

  // If there are no roles in this category, mention that there are none
  if (roles.length === 0) {
    roleInfoEmbed.description = 'There are no roles in this category yet.';
  }

  // Fetch and edit the category message
  guild.channels.resolve(roleCategory.roleRequestChannelId).messages.fetch(messageId)
    .then((categoryMessage) => categoryMessage.edit({ content: null, embeds: [roleInfoEmbed] })
      .then().catch((err) => generalErrorHandler(err)));
};

module.exports = {
  category: 'Role Requestor',
  commands: [
    {
      longDescription: 'Create a #role-request text channel for users to interact with' +
        'AginahBot and request roles. This channel will be used to post role category messages users can react to ' +
        'to add or remove roles.',
      commandBuilder: new SlashCommandBuilder()
        .setName('role-system-enable')
        .setDescription('Enable the role system on this server.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT gd.id AS guildDataId, rs.id AS roleSystemId
                    FROM guild_data gd
                    LEFT JOIN role_systems rs ON gd.id = rs.guildDataId
                    WHERE gd.guildId=?`;
        const row = await dbQueryOne(sql, [interaction.guildId]);
        if (!row) { throw new Error(); }
        if (row.roleSystemId) {
          return interaction.reply('The role system has already been set up on your server.');
        }
        interaction.guild.channels.create({
          name: 'role-request',
          type: ChannelType.GuildText,
          topic: 'Request roles so that you may be pinged for various notifications.',
          reason: 'Role Request system created.',
          permissionOverwrites: [
            {
              id: interaction.client.user.id,
              allow: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions ],
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
              'assigned a role, please react to the appropriate message with the indicated ' +
              'emoji. All roles are pingable by everyone on the server. Remember, with great ' +
              'power comes great responsibility.');
          interaction.reply('Role system enabled.');
        }).catch((error) => generalErrorHandler(error));
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-system-destroy')
        .setDescription('Delete the role-request channel and all categories and permissions created by this bot.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT rs.id, rs.roleRequestChannelId FROM role_systems rs
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [interaction.guildId]);
        if (!roleSystem) {
          // If the role system does not exist, there is no need to attempt to delete it
          return interaction.reply('The role system is not currently installed on this server.');
        }

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
        return interaction.reply('Role system disabled.');
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
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');

        let sql = `SELECT 1 FROM role_categories rc
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?`;
        const row = await dbQueryOne(sql, [interaction.guildId, categoryName]);
        if (row) { return interaction.reply('That category already exists!'); }

        sql = `SELECT rs.id, rs.roleRequestChannelId
               FROM role_systems rs
               JOIN guild_data gd ON rs.guildDataId=gd.id
               WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [interaction.guildId]);
        if (!roleSystem) {
          return interaction.reply('The role system has not been setup on this server.');
        }

        // Add the category message to the #role-request channel
        interaction.guild.channels.resolve(roleSystem.roleRequestChannelId).send('Creating new category...')
          .then(async (categoryMessage) => {
            // Update database with new category message data
            let sql = 'INSERT INTO role_categories (roleSystemId, categoryName, messageId) VALUES (?, ?, ?)';
            await dbExecute(sql, [roleSystem.id, categoryName, categoryMessage.id]);
            await updateCategoryMessage(interaction.client, interaction.guild, categoryMessage.id);
            return interaction.reply(`Created role category: ${categoryName}.`);
          });
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
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction){
        const oldName = interaction.options.getString('old-name');
        const newName = interaction.options.getString('new-name');

        // Find a matching role category
        let sql = `SELECT rc.id, rc.messageId
                   FROM guild_data gd
                   JOIN role_systems rs ON rs.guildDataId = gd.id
                   JOIN role_categories rc ON rc.roleSystemId = rs.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?`;
        const categoryData = await dbQueryOne(sql, [interaction.guildId, oldName]);
        if (!categoryData) { return interaction.channel.send('That category does not exist!'); }
        await dbExecute('UPDATE role_categories SET categoryName=? WHERE id=?', [newName, categoryData.id]);
        await updateCategoryMessage(interaction.client, interaction.guild, categoryData.messageId);
        return interaction.reply(`Role category renamed from ${oldName} to ${newName}.`);
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
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
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
        if (!roleCategory) { return interaction.reply('That category does not exist!'); }

        const roleIds = await dbQueryAll('SELECT roleId FROM roles WHERE categoryId=?', [roleCategory.id]);
        for (const roleId of roleIds) {
          const role = await interaction.guild.roles.fetch(roleId);
          await role.delete();
        }

        await dbExecute('DELETE FROM roles WHERE categoryId=?', [roleCategory.id]);
        await dbExecute('DELETE FROM role_categories WHERE id=?', [roleCategory.id]);
        interaction.guild.channels.resolve(roleCategory.roleRequestChannelId).messages.fetch(roleCategory.messageId)
          .then((categoryMessage) => categoryMessage.delete()).catch((err) => generalErrorHandler(err));
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
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
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
        if (row) { return interaction.reply('That role already exists!'); }

        // Verify the requested emoji is available on this server
        const emoji = await parseEmoji(interaction.guild, reaction, true);
        if (!emoji) { return interaction.reply('That emoji is not available on this server!'); }

        sql = `SELECT rc.id, rc.messageId, rs.roleRequestChannelId FROM role_categories rc
               JOIN role_systems rs ON rc.roleSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE gd.guildId=?
                 AND rc.categoryName=?`;
        const roleCategory = await dbQueryOne(sql, [interaction.guildId, categoryName]);
        // If there is no such category, warn the user and do nothing
        if (!roleCategory) { return interaction.reply('That category doesn\'t exist!'); }

        // Create the role on the server
        interaction.guild.roles.create({
          name: roleName,
          mentionable: true,
          reason: 'Added as part of role-request system.',
        }).then(async (role) => {
          // Add the role to the database
          await dbExecute(
            'INSERT INTO roles (categoryId, roleId, roleName, reaction, description) VALUES (?, ?, ?, ?, ?)',
            [roleCategory.id, role.id, roleName, emoji.toString(), description]
          );
          await updateCategoryMessage(interaction.client, interaction.guild, roleCategory.messageId);

          // Add the reaction to the category message
          interaction.guild.channels.resolve(roleCategory.roleRequestChannelId).messages.fetch(roleCategory.messageId)
            .then((categoryMessage) => {
              categoryMessage.react(emoji).catch((err) => generalErrorHandler(err));
              interaction.reply(`Created role ${roleName} in the ${categoryName} category.`);
            });
        }).catch((error) => {
          throw new Error(`Unable to create guild role. ${error}`);
        });
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
        .addStringOption((opt) => opt
          .setName('old-name')
          .setDescription('Current name of the role you wish to rename')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('new-name')
          .setDescription('The new name of the role')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction){
        const categoryName = interaction.options.getString('category-name');
        const oldName = interaction.options.getString('old-name');
        const newName = interaction.options.getString('new-name');

        let sql = `SELECT r.id, r.roleId, rc.messageId
                   FROM guild_data gd
                   JOIN role_systems rs ON rs.guildDataId = gd.id
                   JOIN role_categories rc ON rc.roleSystemId = rs.id
                   JOIN roles r ON r.categoryId = rc.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleName=?`;
        const roleData = await dbQueryOne(sql, [interaction.guildId, categoryName, oldName]);
        if (!roleData) { return interaction.reply('That role does not exist!'); }

        // Update role name in the database
        await dbExecute('UPDATE roles SET roleName=? WHERE id=?', [newName, roleData.id]);

        // Update role on Discord
        await interaction.guild.roles.edit(roleData.roleId.toString(), { name: newName });

        // Update the category message to display the new role name
        await updateCategoryMessage(interaction.client, interaction.guild, roleData.messageId);
        return interaction.reply(`Renamed role ${oldName} to ${newName} in category ${categoryName}.`);
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
        .addStringOption((opt) => opt
          .setName('role-name')
          .setDescription('Name of the role you wish to change the reaction for')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('reaction')
          .setDescription('New reaction to associate with the role')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const roleName = interaction.options.getString('role-name');
        const reaction = interaction.options.getString('reaction');

        // Check for existing role
        let sql = `SELECT r.id, rc.messageId, rs.roleRequestChannelId, r.reaction FROM roles r
                   JOIN role_categories rc ON r.categoryId = rc.id
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleName=?`;
        const role = await dbQueryOne(sql, [interaction.guildId, categoryName, roleName]);

        // If the role does not exist, inform the user
        if (!role) { return interaction.reply('That role does not exist!'); }

        // Verify the requested emoji is available on this server
        const emoji = await parseEmoji(interaction.guild, reaction, true);
        if (!emoji) { return interaction.reply('That emoji is not available on this server!'); }

        // Remove reactions from the role category message
        interaction.guild.channels.resolve(role.roleRequestChannelId).messages.fetch(role.messageId)
          .then((categoryMessage) => {
            categoryMessage.reactions.cache.each((reaction) => {
              if (reaction.emoji.toString() === role.reaction) { reaction.remove(); }
            });

            // Add new reaction to message
            categoryMessage.react(emoji);
          }).catch((err) => generalErrorHandler(err));

        await dbExecute('UPDATE roles SET reaction=? WHERE id=?', [emoji.toString(), role.id]);
        await updateCategoryMessage(interaction.client, interaction.guild, role.messageId);
        return interaction.reply(`Role ${roleName} reaction updated to ${reaction} in category ${categoryName}.`);
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
        .addStringOption((opt) => opt
          .setName('role-name')
          .setDescription('Name of the role you wish to change the description of')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('description')
          .setDescription('New description for the role')
          .setRequired(false))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const roleName = interaction.options.getString('role-name');
        const description = interaction.options.getString('description', false) ?? null;

        // Check for existing role
        let sql = `SELECT r.id, rc.messageId, rs.roleRequestChannelId FROM roles r
                   JOIN role_categories rc ON r.categoryId = rc.id
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleName=?`;
        const role = await dbQueryOne(sql, [interaction.guildId, categoryName, roleName]);
        if (!role) { return interaction.reply('That role does not exist!'); }

        sql = 'UPDATE roles SET description=? WHERE id=?';
        await dbExecute(sql, [description, role.id]);
        await updateCategoryMessage(interaction.client, interaction.guild, role.messageId);
        return interaction.reply(`Updated description or role ${roleName} in category ${categoryName}.`);
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
        .addStringOption((opt) => opt
          .setName('role-name')
          .setDescription('Name of the role you wish to delete')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const roleName = interaction.options.getString('role-name');

        let sql = `SELECT r.id, rc.id AS categoryId, rc.messageId, r.reaction, r.roleId, rs.roleRequestChannelId
                   FROM roles r
                   JOIN role_categories rc ON r.categoryId = rc.id
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?
                     AND r.roleName=?`;
        const role = await dbQueryOne(sql, [interaction.guildId, categoryName, roleName]);
        if (!role) { return interaction.reply('That role does not exist!'); }

        // Remove reactions from the role category message
        interaction.guild.channels.resolve(role.roleRequestChannelId).messages.fetch(role.messageId)
          .then((categoryMessage) => categoryMessage.reactions.cache.each((r) => {
            if (r.emoji.toString() === role.reaction) { r.remove(); }
          }))
          .catch((err) => generalErrorHandler(err));

        // Remove the role from the guild
        await interaction.guild.roles.resolve(role.roleId).delete();

        // Delete rows from the roles table and update role category message
        await dbExecute('DELETE FROM roles WHERE id=? AND categoryId=?', [role.id, role.categoryId]);
        await updateCategoryMessage(interaction.client, interaction.guild, role.messageId);
        return interaction.reply(`Deleted role ${roleName} from category ${categoryName}.`);
      }
    },
  ],
};
