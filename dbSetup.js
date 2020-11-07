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

const roomSystems = `CREATE TABLE IF NOT EXISTS room_systems (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    guildDataId INTEGER NOT NULL,
    channelCategoryId VARCHAR(128) NOT NULL,
    planningChannelId VARCHAR(128) NOT NULL,
    newGameChannelId VARCHAR(128) NOT NULL
)`;

const roomSystemGames = `CREATE TABLE IF NOT EXISTS room_system_games (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    roomSystemId INTEGER NOT NULL,
    voiceChannelId VARCHAR(128) NOT NULL,
    textChannelId VARCHAR(128) NOT NULL,
    roleId VARCHAR(128) NOT NULL
)`;

const roomSystemReadyChecks = `CREATE TABLE IF NOT EXISTS room_system_ready_checks (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    gameId INTEGER NOT NULL,
    playerId VARCHAR(64) NOT NULL,
    playerTag VARCHAR(256) NOT NULL,
    readyState INTEGER NOT NULL DEFAULT 0
)`;

const scheduledEvents = `CREATE TABLE IF NOT EXISTS scheduled_events (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    guildDataId INTEGER NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    channelId VARCHAR(64) NOT NULL,
    messageId VARCHAR(64) NOT NULL,
    schedulingUserId VARCHAR(64) NOT NULL,
    schedulingUserTag VARCHAR(128) NOT NULL
)`;

const eventAttendees = `CREATE TABLE IF NOT EXISTS event_attendees (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    eventId INTEGER NOT NULL,
    userId VARCHAR(64) NOT NULL
)`;

module.exports = () => {
    const db = new sqlite3.Database(dbFile);
    db.serialize(() => {
        db.run(guildData);
        db.run(roleSystems);
        db.run(roleCategories);
        db.run(roles);
        db.run(roomSystems);
        db.run(roomSystemGames);
        db.run(roomSystemReadyChecks);
        db.run(scheduledEvents);
        db.run(eventAttendees);
    });
};
