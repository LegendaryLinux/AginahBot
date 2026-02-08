const { Client, Guild, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle } = require('discord.js');
const mysql = require('mysql2');
const config = require('./config.json');
const { generalErrorHandler } = require('./errorHandlers');

const dbConnectionPool = mysql.createPool({
  host: config.dbHost,
  user: config.dbUser,
  password: config.dbPass,
  database: config.dbName,
  supportBigNumbers: true,
  bigNumberStrings: true,
  waitForConnections: true,
  connectionLimit: config.dbConnectionLimit,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const formatLogField = (value) => {
  let strValue = value;

  if (typeof value !== 'string') {
    try {
      strValue = JSON.stringify(value);
    } catch (err) {
      strValue = '[unserializable]';
    }
  }

  if (!strValue) { return ''; }
  return strValue.replace(/\s+/g, ' ').trim();
};

const logDbError = (operation, sql, args, err) => {
  console.error(`[mysql] ${operation} failed`, {
    message: err.message,
    code: err.code || null,
    errno: err.errno || null,
    sqlState: err.sqlState || null,
    fatal: !!err.fatal,
    syscall: err.syscall || null,
    sql: formatLogField(sql),
    args: formatLogField(args),
  });
};

dbConnectionPool.on('connection', (connection) => {
  connection.on('error', (err) => {
    logDbError('connection', 'Unable to connect to database', [], err);
  });
});

module.exports = {
  // Function which returns a promise which will resolve to true or false
  verifyModeratorRole: (guildMember) => new Promise(async (resolve) => {
    if (module.exports.verifyIsAdmin(guildMember)) { resolve(true); }
    const moderatorRole = await module.exports.getModeratorRole(guildMember.guild);
    resolve(moderatorRole.position <= guildMember.roles.highest.position);
  }),

  verifyIsAdmin: (guildMember) => {
    if (!guildMember) { return false; }
    return guildMember.permissions.has(PermissionFlagsBits.Administrator);
  },

  getModeratorRole: (guild) => new Promise(async (resolve) => {
    let modRole = null;

    // If this guild has a known moderator role id, fetch that role
    let sql = 'SELECT moderatorRoleId FROM guild_data WHERE guildId=?';
    let result = await module.exports.dbQueryOne(sql, [guild.id]);
    if (result && result.hasOwnProperty('moderatorRoleId') && result.moderatorRoleId) {
      modRole = guild.roles.resolve(result.moderatorRoleId);
      if (modRole) {
        return resolve(modRole);
      }
    }

    // The guild's moderator role is not known, or it has been deleted. Attempt to find a moderator role
    // and update the database
    modRole = await module.exports.discoverModeratorRole(guild);
    if (modRole) {
      await module.exports.dbExecute('UPDATE guild_data SET moderatorRoleId=? WHERE guildId=?',
        [modRole.id, guild.id]);
    }

    // Resolve with the newly found moderator role, or with null of no role could be found
    return resolve(modRole || null);
  }),

  /**
   * Search a guild for a role with whose name matches config.moderatorRole
   * @param guild
   * @returns Promise which resolves to a Discord Role object, or null if no role could be found
   */
  discoverModeratorRole: async (guild) => {
    let modRole = null;
    await guild.roles.cache.each((role) => {
      if (modRole !== null) { return; }
      if (role.name === config.moderatorRole) {
        modRole = role;
      }
    });
    return modRole;
  },

  handleGuildCreate: async (client, guild) => {
    console.info(`Creating db structure after joining guild ${guild.id}`);

    // Find this guild's moderator role id
    let moderatorRole = await module.exports.getModeratorRole(guild);
    if (!moderatorRole) {
      return guild.roles.create({
        name: config.moderatorRole,
        reason: `AginahBot requires a ${config.moderatorRole} role.`
      }).then(async (moderatorRole) => {
        let sql = 'INSERT INTO guild_data (guildId, moderatorRoleId) VALUES (?, ?)';
        await module.exports.dbExecute(sql, [guild.id, moderatorRole.id]);
      }).catch((err) => generalErrorHandler(err));
    }

    // Create guild data
    let sql = 'INSERT INTO guild_data (guildId, moderatorRoleId) VALUES (?, ?)';
    await module.exports.dbExecute(sql, [guild.id, moderatorRole.id]);

    // Create guild options
    const guildData = await module.exports.dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [guild.id]);
    await module.exports.dbExecute('INSERT INTO guild_options (guildDataId) VALUES (?)', [guildData.id]);
  },

  handleGuildDelete: async (client, guild) => {
    console.info(`Cleaning up guild data after leaving guild ${guild.id}`);

    const guildData = await module.exports.dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [guild.id]);
    if (!guildData) {
      console.warn('No guild_data entry could be found when trying to handleGuildDelete for ' +
        `guild: ${guild.name} (${guild.id}).`);
      return;
    }

    // Delete dynamic game system data
    const roomSystems = await module.exports.dbQueryAll('SELECT id FROM room_systems WHERE guildDataId=?',
      [guildData.id]);
    roomSystems.forEach((roomSystem) => {
      module.exports.dbExecute('DELETE FROM room_system_channels WHERE roomSystemId=?', [roomSystem.id]);
      module.exports.dbExecute('DELETE FROM room_systems WHERE id=?', [roomSystem.id]);
    });

    // Delete role requestor system data
    const roleSystem = await module.exports.dbQueryOne('SELECT id FROM role_systems WHERE guildDataId=?',
      [guildData.id]);
    if (roleSystem) {
      const categories = await module.exports.dbQueryAll('SELECT id FROM role_categories WHERE roleSystemId=?',
        [roleSystem.id]);
      categories.forEach((category) => {
        module.exports.dbExecute('DELETE FROM roles WHERE categoryId=?', [category.id]);
      });
      await module.exports.dbExecute('DELETE FROM role_categories WHERE roleSystemId=?', [roleSystem.id]);
      await module.exports.dbExecute('DELETE FROM role_systems WHERE id=?', [roleSystem.id]);
    }

    // Delete guild data and options
    await module.exports.dbExecute('DELETE FROM guild_options WHERE guildDataId=?', [guildData.id]);
    await module.exports.dbExecute('DELETE FROM guild_data WHERE id=?', [guildData.id]);
  },

  verifyGuildSetups: async (client) => {
    for (const guild of client.guilds.cache.values()) {
      // Ensure guild_data exists
      let guildData = await module.exports.dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [guild.id]);
      if (!guildData) {
        await module.exports.handleGuildCreate(client, guild);
        guildData = await module.exports.dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [guild.id]);
      }

      if (!guildData) {
        console.warn(`Unable to verify guild setup for guild ${guild.id}. No guild_data entry found.`);
        continue;
      }

      // Ensure guild_options exists
      const guildOptions = await module.exports.dbQueryOne(
        'SELECT 1 FROM guild_options WHERE guildDataId=?',
        [guildData.id]
      );
      if (!guildOptions) {
        await module.exports.dbExecute('INSERT INTO guild_options (guildDataId) VALUES (?)', [guildData.id]);
      }
    }
  },

  /**
   * Get an emoji object usable with Discord. Null if the Emoji is not usable in the provided guild.
   * @param guild
   * @param emoji
   * @param force
   * @returns String || Object || null
   */
  parseEmoji: async (guild, emoji, force = false) => {
    const match = emoji.match(/^<:(.*):(\d+)>$/);
    if (match && match.length > 2) {
      const emojis = await guild.emojis.fetch(null, { force });
      const emojiObj = emojis.get(match[2]);
      return emojiObj ? emojiObj : null;
    }

    const nodeEmoji = require('node-emoji');
    return nodeEmoji.has(emoji) ? emoji : null;
  },

  cachePartial: (partial) => new Promise((resolve, reject) => {
    if (!partial.partial) { resolve(partial); }
    partial.fetch()
      .then((full) => resolve(full))
      .catch((error) => reject(error));
  }),

  dbQueryOne: (sql, args = []) => new Promise((resolve, reject) => {
    dbConnectionPool.query(sql, args, (err, result) => {
      if (err) {
        logDbError('queryOne', sql, args, err);
        reject(err);
      }
      else if (result.length > 1) { reject('More than one row returned'); }
      else { resolve(result.length === 1 ? result[0] : null); }
    });
  }),

  dbQueryAll: (sql, args = []) => new Promise((resolve, reject) => {
    dbConnectionPool.query(sql, args, (err, result) => {
      if (err) {
        logDbError('queryAll', sql, args, err);
        reject(err);
      }
      else { resolve(result); }
    });
  }),

  dbExecute: (sql, args = []) => new Promise((resolve, reject) => {
    dbConnectionPool.execute(sql, args, (err) => {
      if (err) {
        logDbError('execute', sql, args, err);
        reject(err);
      }
      else { resolve(); }
    });
  }),

  parseArgs: (command) => {
    // Quotes with which arguments can be wrapped
    const quotes = ['\'', '"'];

    // State tracking
    let insideQuotes = false;
    let currentQuote = null;

    // Parsed arguments are stored here
    const args = [];

    // Break the command into an array of characters
    const commandChars = command.trim().split('');

    let thisArg = '';
    commandChars.forEach((char) => {
      if (char === ' ' && !insideQuotes){
        // This is a whitespace character used to separate arguments
        if (thisArg) { args.push(thisArg); }
        thisArg = '';
        return;
      }

      // If this character is a quotation mark
      if (quotes.indexOf(char) > -1) {
        // If the cursor is currently inside a quoted string and has found a matching quote to the
        // quote which started the string
        if (insideQuotes && currentQuote === char) {
          args.push(thisArg);
          thisArg = '';
          insideQuotes = false;
          currentQuote = null;
          return;
        }

        // If a quote character is found within a quoted string but it does not match the current enclosing quote,
        // it should be considered part of the argument
        if (insideQuotes) {
          thisArg += char;
          return;
        }

        // Cursor is not inside a quoted string, so we now consider it within one
        insideQuotes = true;
        currentQuote = char;
        return;
      }

      // Include the character in the current argument
      thisArg += char;
    });

    // Append current argument to array if it is populated
    if (thisArg) {args.push(thisArg); }

    return args;
  },

  /**
   *
   * @param client {Client}
   * @param guild {Guild}
   * @returns {Promise<void>}
   */
  updateScheduleBoard: async (client, guild) => {
    // Find all schedule boards
    let sql = `SELECT sb.id, gd.id AS guildId, sb.channelId, sb.messageId
               FROM schedule_boards sb
               JOIN guild_data gd ON sb.guildDataId = gd.id
               WHERE gd.guildId=?`;
    const boards = await module.exports.dbQueryAll(sql, [guild.id]);

    for (let board of boards) {
      // Find board channel, clean database if channel has been deleted
      const boardChannel = await guild.channels.fetch(board.channelId);
      if (!boardChannel) {
        await module.exports.dbExecute('DELETE FROM schedule_boards WHERE id=?', [board.id]);
        continue;
      }

      // Find board message, clean database if message has been deleted
      const boardMessage = await boardChannel.messages.fetch(board.messageId);
      if (!boardMessage) {
        await module.exports.dbExecute('DELETE FROM schedule_boards WHERE id=?', [board.id]);
        continue;
      }

      sql = `SELECT se.id, se.timestamp, se.schedulingUserId, se.channelId, se.messageId, se.threadId, se.eventCode,
                se.title, se.duration
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                 AND se.timestamp > ?
             ORDER BY se.timestamp
             LIMIT 10`;
      const events = await module.exports.dbQueryAll(sql, [guild.id, new Date().getTime()]);

      // If there are no scheduled events for this guild, continue to the next schedule board
      if (events.length === 0) {
        return boardMessage.edit({ content: 'There are no upcoming events.', embeds: [] });
      }

      sql = `SELECT COUNT(*) AS count
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                 AND se.timestamp > ?
             ORDER BY se.timestamp
             LIMIT 10`;
      const countResult = await module.exports.dbQueryOne(sql, [guild.id, new Date().getTime()]);

      // Embeds which will be PUT to the schedule board message
      const embeds = [];

      const embedColors = [
        '3498DB',  // Light Blue
        '2ECC71',  // Green
        'E67E22',  // Orange
        'E74C3C',  // Light Red (Rose)
        '34495E',  // Navy
        '8B0000',  // Dark Red (Maroon)
        '8A2BE2',  // Purple
        '008080',  // Teal
        'DDA0DD',  // Plum
        '808000'   // Olive
      ];

      for (let event of events) {
        let eventChannel = null;
        let eventMessage = null;
        try {
          eventChannel = await guild.channels.fetch(event.channelId);
          eventMessage = await eventChannel.messages.fetch(event.messageId);

        } catch (err) {
          if (err.status !== 404) {
            throw err;
          }

          // If the channel or message is gone, remove this event from the table
          await module.exports.dbExecute('DELETE FROM scheduled_events WHERE id=?', [event.id]);
          continue;
        }

        let schedulingUser = null;
        try {
          schedulingUser = await guild.members.fetch(event.schedulingUserId);
        } catch (err) {
          if (err.status !== 404) {
            throw err;
          }

          // If we have a 404 here, it means the user is no longer a member of the guild. In these instances,
          // no information about the user will be included in the embed
        }

        let eventThread = null;
        try {
          eventThread = event.threadId ? await guild.channels.fetch(event.threadId) : null;
        } catch (err) {
          if (err.status !== 404) {
            throw err;
          }

          // It's possible for a thread to have been deleted. In these cases, we remove the thread from the table
          await module.exports.dbExecute('UPDATE scheduled_events SET threadId=NULL WHERE id=?', [event.id]);
        }

        // Determine RSVP count
        const rsvpCount = await module.exports.dbQueryOne(
          'SELECT COUNT(*) AS count FROM event_rsvp WHERE eventId=?',
          [event.id]
        );

        const embed = new EmbedBuilder()
          .setTitle(`${event.title || 'Upcoming Event'}`)
          .setDescription(
            `Starts <t:${Math.floor(event.timestamp / 1000)}:R> and should last` +
            `${event.duration ? ` about ${event.duration} hours` : ' an undisclosed amount of time'}`
          )
          .setColor(`#${embedColors.pop()}`)
          .setAuthor({ name: schedulingUser.displayName })
          .setURL(eventMessage.url)
          .setThumbnail(schedulingUser.displayAvatarURL())
          .addFields(
            { name: 'Date/Time', value: `<t:${Math.floor(event.timestamp / 1000)}:F>`, inline: true },
            { name: ' ', value: ' ', inline: true },
            {
              name: 'Planning Channel',
              value: eventThread ? `[#${eventChannel.name}](${eventThread.url})` : `#${eventChannel.name}`,
              inline: true,
            },
            { name: 'Event Code', value: event.eventCode, inline: true },
            { name: ' ', value: ' ', inline: true },
            { name: 'Current RSVPs', value: rsvpCount.count.toString(), inline: true },
          );
        embeds.push(embed);
      }

      // Update the schedule board
      await boardMessage.edit({
        content: (countResult.count > 10) ? '# Next 10 Upcoming Events' : '# Upcoming Events',
        embeds
      });
    }
  },

  /**
   * Update all schedule boards across all guilds
   * @param client {Client}
   */
  updateScheduleBoards: async (client) => {
    // Find all schedule boards
    let sql = `SELECT sb.id, gd.guildId AS guildId, sb.channelId, sb.messageId
               FROM schedule_boards sb
               JOIN guild_data gd ON sb.guildDataId = gd.id`;
    const boards = await module.exports.dbQueryAll(sql);

    for (let board of boards) {
      // Fetch updated data for this guild
      const guild = await client.guilds.fetch(board.guildId);

      // Find board channel, clean database if channel has been deleted
      let boardChannel = null;
      try {
        boardChannel = await guild.channels.fetch(board.channelId);
      } catch (err) {
        if (err.status === 404) {
          await module.exports.dbExecute('DELETE FROM schedule_boards WHERE id=?', [board.id]);
          continue;
        }
      }

      // Ensure boardChannel is non-null
      if (boardChannel === null) {
        continue;
      }

      // Find board message, clean database if message has been deleted
      let boardMessage = null;
      try {
        boardMessage = await boardChannel.messages.fetch(board.messageId);
      } catch (err) {
        if (err.status === 404) {
          await module.exports.dbExecute('DELETE FROM schedule_boards WHERE id=?', [board.id]);
          continue;
        }
      }

      // Ensure boardMessage is non-null
      if (boardMessage === null) {
        continue;
      }

      sql = `SELECT se.id, se.timestamp, se.schedulingUserId, se.channelId, se.messageId, se.threadId,
                    se.eventCode, se.title, se.duration
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                 AND se.timestamp > ?
             ORDER BY se.timestamp
             LIMIT 10`;
      const events = await module.exports.dbQueryAll(sql, [guild.id, new Date().getTime()]);

      // If there are no scheduled events for this guild, continue to the next schedule board
      if (events.length === 0) {
        await boardMessage.edit({ content: 'There are no upcoming events.', embeds: [] });
        continue;
      }

      sql = `SELECT COUNT(*) AS count
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                 AND se.timestamp > ?
             ORDER BY se.timestamp
             LIMIT 10`;
      const countResult = await module.exports.dbQueryOne(sql, [guild.id, new Date().getTime()]);

      // Embeds which will be PUT to the schedule board message
      const embeds = [];

      const embedColors = [
        '3498DB',  // Light Blue
        '2ECC71',  // Green
        'E67E22',  // Orange
        'E74C3C',  // Light Red (Rose)
        '34495E',  // Navy
        '8B0000',  // Dark Red (Maroon)
        '8A2BE2',  // Purple
        '008080',  // Teal
        'DDA0DD',  // Plum
        '808000'   // Olive
      ];

      for (let event of events) {
        let eventChannel = null;
        let eventMessage = null;
        try {
          eventChannel = await guild.channels.fetch(event.channelId);
          eventMessage = await eventChannel.messages.fetch(event.messageId);

        } catch (err) {
          if (err.status !== 404) {
            throw err;
          }

          // If the channel or message is gone, remove this event from the table
          await module.exports.dbExecute('DELETE FROM scheduled_events WHERE id=?', [event.id]);
          continue;
        }

        let schedulingUser = null;
        try {
          schedulingUser = await guild.members.fetch(event.schedulingUserId);
        } catch (err) {
          if (err.status !== 404) {
            throw err;
          }

          // If we have a 404 here, it means the user is no longer a member of the guild. In these instances,
          // no information about the user will be included in the embed
        }

        let eventThread = null;
        try {
          eventThread = event.threadId ? await guild.channels.fetch(event.threadId) : null;
        } catch (err) {
          if (err.status !== 404) {
            throw err;
          }

          // It's possible for a thread to have been deleted. In these cases, we remove the thread from the table
          await module.exports.dbExecute('UPDATE scheduled_events SET threadId=NULL WHERE id=?', [event.id]);
        }

        // Determine RSVP count
        const rsvpCount = await module.exports.dbQueryOne(
          'SELECT COUNT(*) AS count FROM event_rsvp WHERE eventId=?',
          [event.id]
        );

        const embed = new EmbedBuilder()
          .setTitle(`${event.title || 'Upcoming Event'}`)
          .setDescription(
            `Starts <t:${Math.floor(event.timestamp / 1000)}:R> and should last` +
            `${event.duration ? ` about ${event.duration} hours` : ' an undisclosed amount of time'}`
          )
          .setColor(`#${embedColors.pop()}`)
          .setAuthor({ name: schedulingUser?.displayName || 'Unknown User' })
          .setURL(eventMessage.url)
          .addFields(
            { name: 'Date/Time', value: `<t:${Math.floor(event.timestamp / 1000)}:F>`, inline: true },
            { name: ' ', value: ' ', inline: true },
            {
              name: 'Planning Channel',
              value: eventThread ? `[#${eventChannel.name}](${eventThread.url})` : `#${eventChannel.name}`,
              inline: true,
            },
            { name: 'Event Code', value: event.eventCode, inline: true },
            { name: ' ', value: ' ', inline: true },
            { name: 'Current RSVPs', value: rsvpCount.count.toString(), inline: true },
          );
        if (schedulingUser) {
          embed.setThumbnail(schedulingUser.displayAvatarURL());
        }
        embeds.push(embed);
      }

      // Update the schedule board
      await boardMessage.edit({
        content: (countResult.count > 10) ? '# Next 10 Upcoming Events' : '# Upcoming Events',
        embeds
      });
    }
  },

  buildControlMessagePayload: (member) => ({
    content: `This voice channel is currently owned by ${member}.\nThe following actions are available:` +
      '\n-# Discord prohibits changing voice channel names more than twice per ten minutes.',
    components: [
      new ActionRowBuilder().addComponents(...[
        new ButtonBuilder()
          .setCustomId('eventRoom-rename')
          .setLabel('Rename Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('eventRoom-close')
          .setLabel('Close Room')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('eventRoom-sendPing')
          .setLabel('Send Event Ping')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('eventRoom-transfer')
          .setLabel('Transfer Ownership')
          .setStyle(ButtonStyle.Danger),
      ])
    ]
  }),

  updateCategoryMessage: async (client, guild, messageId) => {
    // Fetch the target message
    let sql = `SELECT rc.id, rc.categoryName, rs.roleRequestChannelId
             FROM role_categories rc
             JOIN role_systems rs ON rc.roleSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id
             WHERE gd.guildId=?
               AND rc.messageId=?`;
    const roleCategory = await module.exports.dbQueryOne(sql, [guild.id, messageId]);
    if (!roleCategory) { throw Error('Unable to update category message. Role category could not be found.'); }

    const roleInfoEmbed = {
      title: roleCategory.categoryName,
      fields: [],
    };
    sql = 'SELECT r.roleId, r.reaction, r.reactionString, r.description FROM roles r WHERE r.categoryId=?';
    const roles = await module.exports.dbQueryAll(sql, [roleCategory.id]);

    const actionRows = [];
    let buttons = [];

    roles.forEach((role) => {
      const roleName = guild.roles.resolve(role.roleId).name;

      // Add an embed field for this role
      roleInfoEmbed.fields.push({
        name: `${role.reactionString} ${roleName}`,
        value: role.description || 'No description provided.',
      });

      // A maximum of five buttons are allowed per row
      if (buttons.length === 5) {
        actionRows.push(new ActionRowBuilder().addComponents(...buttons));
        buttons = [];
      }

      // Create the button for this role
      buttons.push(new ButtonBuilder()
        .setCustomId(`role-request||${role.roleId}`)
        .setLabel(' ')
        .setEmoji(role.reaction)
        .setStyle(ButtonStyle.Secondary));
    });

    // Add any remaining buttons to the embed
    if (buttons.length > 0) {
      actionRows.push(new ActionRowBuilder().addComponents(...buttons));
    }

    // If there are no roles in this category, mention that there are none
    if (roles.length === 0) {
      roleInfoEmbed.description = 'There are no roles in this category yet.';
    }

    // Fetch and edit the category message
    const roleRequestChannel = guild.channels.resolve(roleCategory.roleRequestChannelId);
    const categoryMessage = await roleRequestChannel.messages.fetch(messageId);

    const messageData = { content: null, embeds: [roleInfoEmbed] };
    if (actionRows.length > 0) {
      messageData.components = actionRows;
    }

    await categoryMessage.edit(messageData);
  },
};
