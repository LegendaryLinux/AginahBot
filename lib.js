const Discord = require('discord.js');
const mysql = require('mysql2');
const moment = require('moment-timezone');
const config = require('./config.json');
const { generalErrorHandler } = require('./errorHandlers');
const { TimeParserValidationError } = require('./customErrors');

module.exports = {
  // Function which returns a promise which will resolve to true or false
  verifyModeratorRole: (guildMember) => new Promise(async (resolve) => {
    if (module.exports.verifyIsAdmin(guildMember)) { resolve(true); }
    const moderatorRole = await module.exports.getModeratorRole(guildMember.guild);
    resolve(moderatorRole.position <= guildMember.roles.highest.position);
  }),

  verifyIsAdmin: (guildMember) => guildMember.permissions.has(Discord.PermissionFlagsBits.Administrator),

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

    let sql = 'INSERT INTO guild_data (guildId, moderatorRoleId) VALUES (?, ?)';
    await module.exports.dbExecute(sql, [guild.id, moderatorRole.id]);
  },

  handleGuildDelete: async (client, guild) => {
    const guildData = await module.exports.dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [guild.id]);
    if (!guildData) {
      throw new Error('No guild data could be found when trying to delete data for guild:' +
        `${guild.name} (${guild.id}).`);
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

    // Delete guild data
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
   * // Return the offset in hours of a given timezone
   * @param zone
   * @returns {number}
   */
  getZoneOffset: (zone) => 0 - moment.tz.zone(zone).utcOffset(new Date().getTime()) / 60,

  parseTimeString: (timeString) => {
    const currentDate = new Date();

    // Format: Strict ISO-8601
    const iso8601Pattern = new RegExp(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(Z|([+-]\d{2}:\d{2}))/);

    // Format: MM/DD/YYYY HH:II TZ
    const mdyPattern = new RegExp(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)/);

    // Format: YYYY-MM-DD HH:MM TZ
    const isoSimplePattern = new RegExp(/^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)/);

    // Format: HH:MM TZ
    const specificHourPattern = new RegExp(/^(\d{1,2}):(\d{2}) ([A-z0-9]*\/[A-z0-9_]*)/);

    // Format: XX:30
    const nextHourPattern = new RegExp(/^X{1,2}:(\d{2})/);

    // Format: X+Y:15
    const futureHourPattern = new RegExp(/^X{1,2}\+(\d{1,2}):(\d{2})/);

    // Format: Unix Timestamp
    const unixPattern = new RegExp(/^\d+/);

    if (timeString.search(iso8601Pattern) > -1) {
      const targetDate = new Date(timeString);
      if (isNaN(targetDate.getTime())) {
        throw new TimeParserValidationError('The date you provided is invalid.');
      }

      return targetDate;

    } else if (timeString.search(mdyPattern) > -1) {
      const patternParts = timeString.match(mdyPattern);
      if (!moment.tz.zone(patternParts[6])) {
        throw new TimeParserValidationError('I don\'t recognize that timezone!');
      }

      const zoneOffset = module.exports.getZoneOffset(patternParts[6]);
      const sign = zoneOffset < 1 ? '-' : '+';
      const targetDate = new Date(`${patternParts[3].toString().padStart(2, '0')}-` +
        `${patternParts[1].toString().padStart(2, '0')}-${patternParts[2].toString().padStart(2, '0')}T` +
        `${patternParts[4].toString().padStart(2, '0')}:${patternParts[5].toString().padStart(2, '0')}${sign}` +
        `${Math.abs(zoneOffset).toString().padStart(2, '0')}:00`);
      if (isNaN(targetDate.getTime())) {
        throw new TimeParserValidationError('The date you provided is invalid.');
      }

      return targetDate;

    } else if (timeString.search(isoSimplePattern) > -1) {
      const patternParts = timeString.match(isoSimplePattern);
      if (!moment.tz.zone(patternParts[6])) {
        throw new TimeParserValidationError('I don\'t recognize that timezone!');
      }
      const zoneOffset = module.exports.getZoneOffset(patternParts[6]);
      if (isNaN(zoneOffset)) {
        throw new TimeParserValidationError('The timezone could not be used to create a valid Date object.');
      }

      const sign = zoneOffset < 1 ? '-' : '+';
      return new Date(`${patternParts[1]}-${patternParts[2]}-${patternParts[3]}T` +
        `${patternParts[4]}:${patternParts[5]}${sign}` +
        `${Math.abs(zoneOffset).toString().padStart(2, '0')}:00`);

    } else if (timeString.search(specificHourPattern) > -1) {
      const patternParts = timeString.match(specificHourPattern);
      if (parseInt(patternParts[1], 10) > 24) {
        throw new TimeParserValidationError('There are only 24 hours in a day!');
      }

      if (parseInt(patternParts[2], 10) > 59) {
        throw new TimeParserValidationError('There are only 60 minutes in an hour!');
      }

      if (!moment.tz.zone(patternParts[3])) {
        throw new TimeParserValidationError('I don\'t recognize that timezone!');
      }
      const zoneOffset = module.exports.getZoneOffset(patternParts[3]);
      if (isNaN(zoneOffset)) {
        throw new TimeParserValidationError('The timezone could not be used to create a valid Date object.');
      }

      const targetDate = new Date();
      targetDate.setUTCHours((parseInt(patternParts[1], 10) - zoneOffset) % 24);
      targetDate.setUTCMinutes(parseInt(patternParts[2], 10));

      // If the offset UTC hour is in the past, bump the date up by one day
      if (targetDate.getTime() < currentDate.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      return targetDate;

    } else if (timeString.search(nextHourPattern) > -1) {
      const patternParts = timeString.match(nextHourPattern);
      if (patternParts[1] > 59) {
        throw new TimeParserValidationError('There are only sixty minutes in an hour!');
      }
      const targetDate = new Date(`${currentDate.getUTCMonth() + 1}/${currentDate.getUTCDate()}` +
        `/${currentDate.getUTCFullYear()} ${currentDate.getUTCHours()}:${patternParts[1]} UTC`);

      if (targetDate.getTime() < currentDate.getTime()) {
        targetDate.setUTCHours(targetDate.getUTCHours() + 1);
      }

      return targetDate;

    } else if (timeString.search(futureHourPattern) > -1) {
      const patternParts = timeString.match(futureHourPattern);
      if (patternParts[2] > 59) {
        throw new TimeParserValidationError('There are only sixty minutes in an hour!');
      }

      let targetDate = new Date(`${currentDate.getUTCMonth() + 1}/${currentDate.getUTCDate()}` +
        `/${currentDate.getUTCFullYear()} ${currentDate.getUTCHours()}:${patternParts[2]} UTC`);

      // Add requested hours to target date
      return new Date(targetDate.getTime() + (parseInt(patternParts[1], 10) * 60 * 60 * 1000));

    } else if (timeString.search(unixPattern) > -1) {
      return new Date(parseInt(timeString, 10) * 1000);

    } else {
      throw new TimeParserValidationError('Sorry, I don\'t understand that time.');
    }
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

      sql = `SELECT se.timestamp, se.schedulingUserTag, se.channelId, se.messageId, se.eventCode
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                 AND se.timestamp > ?
             ORDER BY se.timestamp`;
      const events = await module.exports.dbQueryAll(sql, [guild.id, new Date().getTime()]);

      // If there are no scheduled events for this guild, continue to the next schedule board
      if (events.length === 0) {
        return boardMessage.edit({ content: 'There are no upcoming events.', embeds: [] });
      }

      // Embeds which will be PUT to the schedule board message
      const embeds = [];

      for (let event of events) {
        const eventChannel = guild.channels.fetch(event.channelId);
        const eventMessage = await eventChannel.messages.fetch(event.messageId);

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
          .setTitle(`Upcoming Event on <t:${Math.floor(event.timestamp / 1000)}:F>`)
          .setColor('#6081cb')
          .setDescription('**Click the title of this message to jump to the original.**')
          .setURL(eventMessage.url)
          .addFields(
            { name: 'Scheduled by', value: `@${event.schedulingUserTag}` },
            { name: 'Planning Channel', value: `#${eventChannel.name}` },
            { name: 'Event Code', value: event.eventCode },
            { name: 'Current RSVPs', value: rsvps.size.toString() },
          );
        embeds.push(embed);
      }

      // Update the schedule board
      await boardMessage.edit({ content: '**Upcoming Events:**', embeds });
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

      sql = `SELECT se.timestamp, se.schedulingUserTag, se.channelId, se.messageId, se.eventCode
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                 AND se.timestamp > ?
             ORDER BY se.timestamp`;
      const events = await module.exports.dbQueryAll(sql, [guild.id, new Date().getTime()]);

      // If there are no scheduled events for this guild, continue to the next schedule board
      if (events.length === 0) {
        return boardMessage.edit({ content: 'There are no upcoming events.', embeds: [] });
      }

      // Embeds which will be PUT to the schedule board message
      const embeds = [];

      for (let event of events) {
        const eventChannel = await guild.channels.fetch(event.channelId);
        const eventMessage = await eventChannel.messages.fetch(event.messageId);

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
          .setTitle(`Upcoming Event on <t:${Math.floor(event.timestamp / 1000)}:F>`)
          .setColor('#6081cb')
          .setDescription('**Click the title of this message to jump to the original.**')
          .setURL(eventMessage.url)
          .addFields(
            { name: 'Scheduled by', value: `@${event.schedulingUserTag}` },
            { name: 'Planning Channel', value: `#${eventChannel.name}` },
            { name: 'Event Code', value: event.eventCode },
            { name: 'Current RSVPs', value: rsvps.size.toString() },
          );
        embeds.push(embed);
      }

      // Update the schedule board
      await boardMessage.edit({ content: '**Upcoming Events:**', embeds });
    }
  },
};
