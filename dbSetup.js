const sqlite3 = require('sqlite3');
const { dbFile } = require('./config.json');

const guildData = `CREATE TABLE IF NOT EXISTS guild_data (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    guildId VARCHAR(128) NOT NULL UNIQUE,
    moderatorRoleId VARCHAR(128) NOT NULL
)`;

const roleSystems = `CREATE TABLE IF NOT EXISTS role_systems (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    guildDataId INTEGER NOT NULL UNIQUE,
    roleRequestChannelId VARCHAR(128) NOT NULL
)`;

const roleCategories = `CREATE TABLE IF NOT EXISTS role_categories (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    roleSystemId VARCHAR(128) NOT NULL,
    categoryName VARCHAR(128) NOT NULL,
    messageId VARCHAR(128) NOT NULL
)`;

const roles = `CREATE TABLE IF NOT EXISTS roles (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    categoryId INTEGER NOT NULL,
    roleId VARCHAR(128) NOT NULL,
    roleName VARCHAR(128) NOT NULL,
    reaction VARCHAR(128) NOT NULL,
    description VARCHAR(128)
)`;

const gameCategories = `CREATE TABLE IF NOT EXISTS game_categories (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    guildDataId INTEGER NOT NULL,
    categoryType VARCHAR(128) CHECK(categoryType IN ('casual', 'race')) NOT NULL,
    channelCategoryId VARCHAR(128) NOT NULL,
    planningChannelId VARCHAR(128) NOT NULL,
    newGameChannelId VARCHAR(128) NOT NULL
)`;

const casualGames = `CREATE TABLE IF NOT EXISTS casual_games (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    categoryId INTEGER NOT NULL,
    voiceChannelId VARCHAR(128) NOT NULL,
    textChannelId VARCHAR(128) NOT NULL,
    roleId VARCHAR(128) NOT NULL
)`;

const raceGames = `CREATE TABLE IF NOT EXISTS race_games (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    categoryId INTEGER NOT NULL,
    voiceChannelId VARCHAR(128) NOT NULL,
    textChannelId VARCHAR(128) NOT NULL,
    roleId VARCHAR(128) NOT NULL
)`;

const scheduledGames = `CREATE TABLE IF NOT EXISTS scheduled_games (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    guildDataId INTEGER NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    channelId VARCHAR(64) NOT NULL,
    messageId VARCHAR(64) NOT NULL,
    schedulingUserId VARCHAR(64) NOT NULL,
    schedulingUserTag VARCHAR(128) NOT NULL,
    rsvpCount INTEGER NOT NULL DEFAULT 0
)`;

module.exports = () => {
    const db = new sqlite3.Database(dbFile);
    db.serialize(() => {
        db.run(guildData);
        db.run(roleSystems);
        db.run(roleCategories);
        db.run(roles);
        db.run(gameCategories);
        db.run(casualGames);
        db.run(raceGames);
        db.run(scheduledGames);
    });
};
