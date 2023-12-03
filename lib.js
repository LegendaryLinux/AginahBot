const Discord = require('discord.js');
const mysql = require('mysql2');
const config = require('./config.json');
const { generalErrorHandler } = require('./errorHandlers');

module.exports = {
  // Function which returns a promise which will resolve to true or false
  verifyModeratorRole: (guildMember) => new Promise(async (resolve) => {
    if (module.exports.verifyIsAdmin(guildMember)) { resolve(true); }
    const moderatorRole = await module.exports.getModeratorRole(guildMember.guild);
    resolve(moderatorRole.position <= guildMember.roles.highest.position);
  }),

  verifyIsAdmin: (guildMember) => {
    if (!guildMember) { return false; }
    return guildMember.permissions.has(Discord.PermissionFlagsBits.Administrator);
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
      module.exports.dbExecute('DELETE FROM room_system_games WHERE roomSystemId=?', [roomSystem.id]);
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
    client.guilds.cache.each(async (guild) => {
      const row = await module.exports.dbQueryOne('SELECT 1 FROM guild_data WHERE guildId=?', [guild.id]);
      if (!row) { await module.exports.handleGuildCreate(client, guild); }
    });
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
    return nodeEmoji.hasEmoji(emoji) ? emoji : null;
  },

  cachePartial: (partial) => new Promise((resolve, reject) => {
    if (!partial.hasOwnProperty('partial') || !partial.partial) { resolve(partial); }
    partial.fetch()
      .then((full) => resolve(full))
      .catch((error) => reject(error));
  }),

  dbConnect: () => mysql.createConnection({
    host: config.dbHost,
    user: config.dbUser,
    password: config.dbPass,
    database: config.dbName,
    supportBigNumbers: true,
    bigNumberStrings: true,
  }),

  dbQueryOne: (sql, args = []) => new Promise((resolve, reject) => {
    const conn = module.exports.dbConnect();
    conn.query(sql, args, (err, result) => {
      if (err) { reject(err); }
      else if (result.length > 1) { reject('More than one row returned'); }
      else { resolve(result.length === 1 ? result[0] : null); }
      return conn.end();
    });
  }),

  dbQueryAll: (sql, args = []) => new Promise((resolve, reject) => {
    const conn = module.exports.dbConnect();
    conn.query(sql, args, (err, result) => {
      if (err) { reject(err); }
      else { resolve(result); }
      return conn.end();
    });
  }),

  dbExecute: (sql, args = []) => new Promise((resolve, reject) => {
    const conn = module.exports.dbConnect();
    conn.execute(sql, args, (err) => {
      if (err) { reject(err); }
      else { resolve(); }
      return conn.end();
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
   * @param client {Discord.Client}
   * @param guild {Discord.Guild}
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

      sql = `SELECT se.timestamp, se.schedulingUserId, se.channelId, se.messageId, se.threadId, se.eventCode,
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

      for (let event of events) {
        const eventChannel = await guild.channels.fetch(event.channelId);
        const eventMessage = await eventChannel.messages.fetch(event.messageId);
        const eventThread = event.threadId ? await guild.channels.fetch(event.threadId) : null;

        // Determine RSVP count
        const rsvps = new Map();
        for (let reaction of eventMessage.reactions.cache) {
          const reactors = await reaction[1].users.fetch();
          reactors.each((reactor) => {
            if (reactor.bot) { return; }
            if (rsvps.has(reactor.id)) { return; }
            rsvps.set(reactor.id, reactor);
          });
        }

        const schedulingUser = await guild.members.fetch(event.schedulingUserId);
        const embed = new Discord.EmbedBuilder()
          .setTitle(`${event.title || 'Upcoming Event'}\n<t:${Math.floor(event.timestamp / 1000)}:F>`)
          .setColor('#6081cb')
          .setDescription('**Click the title of this message to jump to the original.**')
          .setURL(eventMessage.url)
          .addFields(
            { name: 'Scheduled by', value: `${schedulingUser.displayName}` },
            { name: 'Planning Channel', value: `#${eventChannel.name}` },
            { name: 'Thread', value:  eventThread ? `[Event Thread](${eventThread.url})` : 'None' },
            { name: 'Event Code', value: event.eventCode.toUpperCase() },
            { name: 'Duration', value: event.duration ? `${event.duration} hours` : 'Undisclosed' },
            { name: 'Current RSVPs', value: rsvps.size.toString() },
          );
        embeds.push(embed);
      }

      // Update the schedule board
      await boardMessage.edit({
        content: (countResult.count > 10) ? '**Next 10 Upcoming Events**' : '**Upcoming Events:**',
        embeds
      });
    }
  },

  /**
   * Update all schedule boards across all guilds
   * @param client {Discord.Client}
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

      sql = `SELECT se.timestamp, se.schedulingUserId, se.channelId, se.messageId, se.threadId, se.eventCode, se.title
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

      for (let event of events) {
        const eventChannel = await guild.channels.fetch(event.channelId);
        const eventMessage = await eventChannel.messages.fetch(event.messageId);
        const eventThread = event.threadId ? await guild.channels.fetch(event.threadId) : null;
        const schedulingUser = await guild.members.fetch(event.schedulingUserId);

        // Determine RSVP count
        const rsvps = new Map();
        for (let reaction of eventMessage.reactions.cache) {
          const reactors = await reaction[1].users.fetch();
          reactors.each((reactor) => {
            if (reactor.bot) { return; }
            if (rsvps.has(reactor.id)) { return; }
            rsvps.set(reactor.id, reactor);
          });
        }

        const embed = new Discord.EmbedBuilder()
          .setTitle(`${event.title || 'Upcoming Event'}\n<t:${Math.floor(event.timestamp / 1000)}:F>`)
          .setColor('#6081cb')
          .setDescription('**Click the title of this message to jump to the original.**')
          .setURL(eventMessage.url)
          .addFields(
            { name: 'Scheduled by', value: `${schedulingUser.displayName}` },
            { name: 'Planning Channel', value: `#${eventChannel.name}` },
            { name: 'Thread', value:  eventThread ? `[Event Thread](${eventThread.url})` : 'None' },
            { name: 'Event Code', value: event.eventCode },
            { name: 'Current RSVPs', value: rsvps.size.toString() },
          );
        embeds.push(embed);
      }

      // Update the schedule board
      await boardMessage.edit({
        content: (countResult.count > 10) ? '**Next 10 Upcoming Events**' : '**Upcoming Events:**',
        embeds
      });
    }
  },
};
