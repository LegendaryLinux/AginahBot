const Discord = require('discord.js');
const mysql = require('mysql2');
const config = require('./config.json');
const { generalErrorHandler } = require('./errorHandlers');

module.exports = {
  // Function which returns a promise which will resolve to true or false
  verifyModeratorRole: (guildMember) => new Promise(async (resolve) => {
    if (module.exports.verifyIsAdmin(guildMember)) { resolve(true); }
    resolve(await module.exports.getModeratorRole(guildMember.guild).position <= guildMember.roles.highest.position);
  }),

  verifyIsAdmin: (guildMember) => guildMember.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR),

  getModeratorRole: (guild) => new Promise(async (resolve) => {
    // Find this guild's moderator role
    let modRole = null;
    await guild.roles.cache.each((role) => {
      if (modRole !== null) { return; }
      if (role.name === config.moderatorRole) {
        modRole = role;
      }
    });
    resolve(modRole);
  }),

  handleGuildCreate: async (client, guild) => {
    // Find this guild's moderator role id
    let moderatorRole = await module.exports.getModeratorRole(guild);
    if (!moderatorRole) {
      return guild.roles.create({
        name: config.moderatorRole,
        reason: `AginahBot requires a ${config.moderatorRole} role.`
      }).then(async (moderatorRole) => {
        let sql = `INSERT INTO guild_data (guildId, moderatorRoleId) VALUES (?, ?)`;
        await module.exports.dbExecute(sql, [guild.id, moderatorRole.id]);
      }).catch((err) => generalErrorHandler(err));
    }

    let sql = `INSERT INTO guild_data (guildId, moderatorRoleId) VALUES (?, ?)`;
    await module.exports.dbExecute(sql, [guild.id, moderatorRole.id]);
  },

  handleGuildDelete: async (client, guild) => {
    const guildData = await module.exports.dbQueryOne(`SELECT id FROM guild_data WHERE guildId=?`, [guild.id])
    if (!guildData) {
      throw new Error(`No guild data could be found when trying to delete data for guild:` +
        `${guild.name} (${guild.id}).`);
    }

    // Delete dynamic game system data
    const roomSystems = await module.exports.dbQueryAll(`SELECT id FROM room_systems WHERE guildDataId=?`,
      [guildData.id]);
    roomSystems.forEach((roomSystem) => {
      module.exports.dbExecute(`DELETE FROM room_system_games WHERE roomSystemId=?`, [roomSystem.id]);
      module.exports.dbExecute(`DELETE FROM room_systems WHERE id=?`, [roomSystem.id]);
    });

    // Delete role requestor system data
    const roleSystem = await module.exports.dbQueryOne(`SELECT id FROM role_systems WHERE guildDataId=?`,
      [guildData.id]);
    if (roleSystem) {
      const categories = await module.exports.dbQueryAll(`SELECT id FROM role_categories WHERE roleSystemId=?`,
        [roleSystem.id]);
      categories.forEach((category) => {
        module.exports.dbExecute(`DELETE FROM roles WHERE categoryId=?`, [category.id]);
      });
      await module.exports.dbExecute(`DELETE FROM role_categories WHERE roleSystemId=?`, [roleSystem.id]);
      await module.exports.dbExecute(`DELETE FROM role_systems WHERE id=?`, [roleSystem.id]);
    }

    // Delete guild data
    await module.exports.dbExecute(`DELETE FROM guild_data WHERE id=?`, [guildData.id]);
  },

  verifyGuildSetups: async (client) => {
    client.guilds.cache.each(async (guild) => {
      const row = await module.exports.dbQueryOne(`SELECT 1 FROM guild_data WHERE guildId=?`, [guild.id]);
      if (!row) { await module.exports.handleGuildCreate(client, guild); }
    });
  },

  /**
   * Get an emoji object usable with Discord. Null if the Emoji is not usable in the provided guild.
   * @param guild
   * @param emoji
   * @returns String || Object || null
   */
  parseEmoji: (guild, emoji) => {
    const emojiIdRegex = new RegExp(/^<:.*:(\d+)>$/);
    const match = emoji.match(emojiIdRegex);
    if (match && match.length > 1) {
      const emojiObj = guild.emojis.resolve(match[1]);
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
    const quotes = [`'`, `"`];

    // State tracking
    let insideQuotes = false;
    let currentQuote = null;

    // Parsed arguments are stored here
    const arguments = [];

    // Break the command into an array of characters
    const commandChars = command.trim().split('');

    let thisArg = "";
    commandChars.forEach((char) => {
      if (char === ' ' && !insideQuotes){
        // This is a whitespace character used to separate arguments
        if (thisArg) { arguments.push(thisArg); }
        thisArg = "";
        return;
      }

      // If this character is a quotation mark
      if (quotes.indexOf(char) > -1) {
        // If the cursor is currently inside a quoted string and has found a matching quote to the
        // quote which started the string
        if (insideQuotes && currentQuote === char) {
          arguments.push(thisArg);
          thisArg = "";
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
    if (thisArg) {arguments.push(thisArg) }

    return arguments;
  },
};
