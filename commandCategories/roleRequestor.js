const config = require('../config.json');
const {generalErrorHandler} = require('../errorHandlers');
const { parseEmoji, dbQueryOne, dbQueryAll, dbExecute } = require('../lib');

const updateCategoryMessage = async (client, guild, messageId) => {
  // Fetch the target message
  let sql = `SELECT rc.id, rc.categoryName, rs.roleRequestChannelId FROM role_categories rc
             JOIN role_systems rs ON rc.roleSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id
             WHERE gd.guildId=?
               AND rc.messageId=?`;
  const roleCategory = await dbQueryOne(sql, [guild.id, messageId]);
  if (!roleCategory) { throw Error("Unable to update category message. Role category could not be found."); }

  const roleInfo = [`> __${roleCategory.categoryName}__`];
  sql = `SELECT r.roleId, r.reaction, r.description FROM roles r WHERE r.categoryId=?`;
  const roles = await dbQueryAll(sql, [roleCategory.id]);
  roles.forEach((role) => {
    roleInfo.push(`> ${role.reaction} ${guild.roles.resolve(role.roleId)}` +
        `${role.description ? `: ${role.description}` : ''}`);
  });

  // If there are no roles in this category, mention that there are none
  if (roleInfo.length === 1) { roleInfo.push("> There are no roles in this category yet."); }

  // Fetch and edit the category message
  guild.channels.resolve(roleCategory.roleRequestChannelId).messages.fetch(messageId)
      .then((categoryMessage) => categoryMessage.edit(roleInfo)
          .then().catch((err) => generalErrorHandler(err)));
};

module.exports = {
  category: 'Role Requestor',
  commands: [
    {
      name: 'init-role-system',
      description: 'Create a role-request channel for users to interact with AginahBot and request roles.',
      longDescription: 'Create a #role-request text channel for users to interact with AginahBot and request ' +
        'roles. This channel will be used to post role category messages users can react to to add or ' +
        'remove roles.',
      aliases: ['irs'],
      usage: '`!aginah init-role-system`',
      minimumRole: null,
      adminOnly: true,
      guildOnly: true,
      async execute(message) {
        let sql = `SELECT gd.id AS guildDataId, rs.id AS roleSystemId
                    FROM guild_data gd
                    LEFT JOIN role_systems rs ON gd.id = rs.guildDataId
                    WHERE gd.guildId=?`;
        const row = await dbQueryOne(sql, [message.guild.id]);
        if (!row) { throw new Error(); }
        if (row.roleSystemId) {
          return message.channel.send("The role system has already been set up on your server.");
        }
        message.guild.channels.create('role-request', {
          type: 'text',
          topic: 'Request roles so that you may be pinged for various notifications.',
          reason: 'Role Request system created.',
          permissionOverwrites: [
            {
              id: message.client.user.id,
              allow: [ 'SEND_MESSAGES', 'ADD_REACTIONS' ],
            },
            {
              id: message.guild.roles.everyone.id,
              deny: [ 'SEND_MESSAGES', 'ADD_REACTIONS' ]
            }
          ],
        }).then(async (channel) => {
          // Add role system data to the database
          let sql = `INSERT INTO role_systems (guildDataId, roleRequestChannelId) VALUES(?, ?)`
          await dbExecute(sql, [row.guildDataId, channel.id]);
          channel.send(`The following roles are available on this server. If you would like to be ` +
              `assigned a role, please react to the appropriate message with the indicated ` +
              `emoji. All roles are pingable by everyone on the server. Remember, with great ` +
              `power comes great responsibility.`);
        }).catch((error) => generalErrorHandler(error));
      }
    },
    {
      name: 'destroy-role-system',
      description: 'Delete the role-request channel and all categories and permissions created by this bot.',
      longDescription: null,
      aliases: ['drs'],
      usage: '`!aginah destroy-role-system`',
      minimumRole: null,
      adminOnly: true,
      guildOnly: true,
      async execute(message) {
        let sql = `SELECT rs.id, rs.roleRequestChannelId FROM role_systems rs
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [message.guild.id]);
        if (!roleSystem) {
          // If the role system does not exist, there is no need to attempt to delete it
          return message.channel.send("The role system is not currently installed on this server.");
        }

        // Loop over the role categories and delete them
        sql = `SELECT id FROM role_categories WHERE roleSystemId=?`;
        const roleCategories = await dbQueryAll(sql, [roleSystem.id]);
        for (let roleCategory of roleCategories) {
          // Loop over the roles in each category and delete them from the server
          const roles = await dbQueryAll(`SELECT roleId FROM roles WHERE categoryId=?`, [roleCategory.id]);
          for (let role of roles) {
            await message.guild.roles.resolve(role.roleId).delete();
          }
          await dbExecute(`DELETE FROM roles WHERE categoryId=?`, [roleCategory.id]);
        }

        // Database cleanup
        await dbExecute(`DELETE FROM role_categories WHERE roleSystemId=?`, [roleSystem.id]);
        message.guild.channels.resolve(roleSystem.roleRequestChannelId).delete();
        await dbExecute(`DELETE FROM role_systems WHERE id=?`, [roleSystem.id]);
      }
    },
    {
      name: 'create-role-category',
      description: 'Create a category for roles to be added to.',
      longDescription: `Create a category for roles to be added to. Each category will have its own message ` +
        `in the #role-request channel. Category names must be a single alphanumeric word.`,
      aliases: [],
      usage: '`!aginah create-role-category CategoryName`',
      minimumRole: config.moderatorRole,
      adminOnly: false,
      guildOnly: true,
      async execute(message, args) {
        if (args.length === 0) {
          return message.channel.send("You must specify a name for the category!");
        }

        let sql = `SELECT 1 FROM role_categories rc
                    JOIN role_systems rs ON rc.roleSystemId = rs.id
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?
                      AND rc.categoryName=?`;
        const row = await dbQueryOne(sql, [message.guild.id, args[0]]);
        if (row) { return message.channel.send("That category already exists!"); }

        sql = `SELECT rs.id, rs.roleRequestChannelId
                      FROM role_systems rs
                      JOIN guild_data gd ON rs.guildDataId=gd.id
                      WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [message.guild.id]);
        if (!roleSystem) {
          return message.channel.send("The role system has not been setup on this server.");
        }

        // Add the category message to the #role-request channel
        message.guild.channels.resolve(roleSystem.roleRequestChannelId).send("Creating new category...")
          .then(async (categoryMessage) => {
            // Update database with new category message data
            let sql = `INSERT INTO role_categories (roleSystemId, categoryName, messageId) VALUES (?, ?, ?)`;
            await dbExecute(sql, [roleSystem.id, args[0], categoryMessage.id]);
            await updateCategoryMessage(message.client, message.guild, categoryMessage.id);
          });
      }
    },
    {
      name: 'delete-role-category',
      description: 'Delete a role category.',
      longDescription: 'Delete a role category. All roles within this category will also be deleted.',
      aliases: [],
      usage: '`!aginah delete-role-category CategoryName`',
      minimumRole: config.moderatorRole,
      adminOnly: false,
      guildOnly: true,
      async execute(message, args) {
        if (args.length === 0) {
          return message.channel.send("You must specify the category to delete!");
        }

        // Get the role category data
        let sql = `SELECT rc.id, rc.messageId, rs.roleRequestChannelId FROM role_categories rc
                    JOIN role_systems rs ON rc.roleSystemId = rs.id
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?
                      AND rc.categoryName=?`;
        const roleCategory = await dbQueryOne(sql, [message.guild.id, args[0]]);
        if (!roleCategory) { return message.channel.send("That category does not exist!"); }
        await dbExecute(`DELETE FROM roles WHERE categoryId=?`, [roleCategory.id]);
        await dbExecute(`DELETE FROM role_categories WHERE id=?`, [roleCategory.id]);
        message.guild.channels.resolve(roleCategory.roleRequestChannelId).messages.fetch(roleCategory.messageId)
          .then((categoryMessage) => categoryMessage.delete()).catch((err) => generalErrorHandler(err));
      }
    },
    {
      name: 'create-role',
      description: 'Create a pingable role.',
      longDescription: null,
      aliases: [],
      usage: '`!aginah cmd create-role CategoryName RoleName Reaction [Description]`',
      minimumRole: config.moderatorRole,
      adminOnly: false,
      guildOnly: true,
      async execute(message, args) {
        // Check for existing role
        let sql = `SELECT 1 FROM roles r
                    JOIN role_categories rc ON r.categoryId = rc.id
                    JOIN role_systems rs ON rc.roleSystemId = rs.id
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?
                      AND rc.categoryName=?
                      AND r.roleName=?`;
        const row = await dbQueryOne(sql, [message.guild.id, args[0], args[1]]);
        // If the role already exists, do nothing
        if (row) { return message.channel.send("That role already exists!"); }

        // Verify the requested emoji is available on this server
        const emoji = parseEmoji(message.guild, args[2]);
        if (!emoji) { return message.channel.send("That emoji is not available on this server!"); }

        sql = `SELECT rc.id, rc.messageId, rs.roleRequestChannelId FROM role_categories rc
                      JOIN role_systems rs ON rc.roleSystemId = rs.id
                      JOIN guild_data gd ON rs.guildDataId = gd.id
                      WHERE gd.guildId=?
                        AND rc.categoryName=?`;
        const roleCategory = await dbQueryOne(sql, [message.guild.id, args[0]]);
        // If there is no such category, warn the user and do nothing
        if (!roleCategory) { return message.channel.send("That category doesn't exist!"); }

        // Create the role on the server
        message.guild.roles.create({
          data: {
            name: args[1],
            mentionable: true,
          },
          reason: 'Added as part of role-request system.',
        }).then(async (role) => {
          // Add the role to the database
          await dbExecute(
            `INSERT INTO roles (categoryId, roleId, roleName, reaction, description) VALUES (?, ?, ?, ?, ?)`,
            [roleCategory.id, role.id, args[1], emoji.toString(), (args[3] ? args.slice(3).join(' ') : null)]
          );
          await updateCategoryMessage(message.client, message.guild, roleCategory.messageId);

          // Add the reaction to the category message
          message.guild.channels.resolve(roleCategory.roleRequestChannelId).messages.fetch(roleCategory.messageId)
              .then((categoryMessage) => categoryMessage.react(emoji).catch((err) => generalErrorHandler(err)));
        }).catch((error) => {
          throw new Error(`Unable to create guild role. ${error}`);
        });
      }
    },
    {
      name: 'modify-role-reaction',
      description: 'Alter the reaction associated with a role created by this bot.',
      longDescription: null,
      aliases: [],
      usage: '`!aginah modify-role-reaction CategoryName RoleName Reaction`',
      minimumRole: config.moderatorRole,
      adminOnly: false,
      guildOnly: true,
      async execute(message, args) {
        // Check for existing role
        let sql = `SELECT r.id, rc.messageId, rs.roleRequestChannelId, r.reaction FROM roles r
                    JOIN role_categories rc ON r.categoryId = rc.id
                    JOIN role_systems rs ON rc.roleSystemId = rs.id
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?
                      AND rc.categoryName=?
                      AND r.roleName=?`;
        const role = await dbQueryOne(sql, [message.guild.id, args[0], args[1]]);
        // If the role already exists, do nothing
        if (!role) { return message.channel.send("That role does not exist!"); }

        // Verify the requested emoji is available on this server
        const emoji = parseEmoji(message.guild, args[2]);
        if (!emoji) { return message.channel.send("That emoji is not available on this server!"); }

        // Remove reactions from the role category message
        message.guild.channels.resolve(role.roleRequestChannelId).messages.fetch(role.messageId)
          .then((categoryMessage) => {
            categoryMessage.reactions.cache.each((reaction) => {
              if (reaction.emoji.toString() === role.reaction) { reaction.remove(); }
            });

            // Add new reaction to message
            categoryMessage.react(emoji);
          }).catch((err) => generalErrorHandler(err));

        await dbExecute(`UPDATE roles SET reaction=? WHERE id=?`, [emoji.toString(), role.id]);
        await updateCategoryMessage(message.client, message.guild, role.messageId);
      }
    },
    {
      name: 'modify-role-description',
      description: 'Alter the description associated with a role created by this bot.',
      longDescription: null,
      aliases: [],
      usage: '`!aginah modify-role-description CategoryName RoleName [Description]`',
      minimumRole: config.moderatorRole,
      adminOnly: false,
      guildOnly: true,
      async execute(message, args) {
        // Check for existing role
        let sql = `SELECT r.id, rc.messageId, rs.roleRequestChannelId FROM roles r
                    JOIN role_categories rc ON r.categoryId = rc.id
                    JOIN role_systems rs ON rc.roleSystemId = rs.id
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?
                      AND rc.categoryName=?
                      AND r.roleName=?`;
        const role = await dbQueryOne(sql, [message.guild.id, args[0], args[1]]);
        if (!role) { return message.channel.send("That role does not exist!"); }

        sql = `UPDATE roles SET description=? WHERE id=?`;
        await dbExecute(sql, [(args[2] ? args.slice(2).join(' ') : null), role.id]);
        await updateCategoryMessage(message.client, message.guild, role.messageId);
      }
    },
    {
      name: 'delete-role',
      description: 'Delete a role created by this bot.',
      longDescription: null,
      aliases: [],
      usage: '`!aginah delete-role CategoryName RoleName`',
      minimumRole: config.moderatorRole,
      adminOnly: false,
      guildOnly: true,
      async execute(message, args) {
        let sql = `SELECT r.id, rc.id AS categoryId, rc.messageId, r.reaction, r.roleId, rs.roleRequestChannelId
                    FROM roles r
                    JOIN role_categories rc ON r.categoryId = rc.id
                    JOIN role_systems rs ON rc.roleSystemId = rs.id
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?
                      AND rc.categoryName=?
                      AND r.roleName=?`;
        const role = await dbQueryOne(sql, [message.guild.id, args[0], args[1]]);
        if (!role) { return message.channel.send("That role does not exist!"); }

        // Remove reactions from the role category message
        message.guild.channels.resolve(role.roleRequestChannelId).messages.fetch(role.messageId)
          .then((categoryMessage) => categoryMessage.reactions.cache.array().forEach((r) => {
            if (r.emoji.toString() === role.reaction) { r.remove(); }
          }))
          .catch((err) => generalErrorHandler(err));

        // Remove the role from the guild
        message.guild.roles.resolve(role.roleId).delete();

        // Delete rows from the roles table and update role category message
        await dbExecute(`DELETE FROM roles WHERE id=? AND categoryId=?`, [role.id, role.categoryId]);
        await updateCategoryMessage(message.client, message.guild, role.messageId);
      }
    },
  ],
};
