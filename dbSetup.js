const mysql = require('mysql2');
const config = require('./config.json');

const guildData = `CREATE TABLE IF NOT EXISTS guild_data (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildId VARCHAR(128) NOT NULL UNIQUE,
    moderatorRoleId VARCHAR(128) NOT NULL
)`;

const roleSystems = `CREATE TABLE IF NOT EXISTS role_systems (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL UNIQUE,
    roleRequestChannelId VARCHAR(128) NOT NULL
)`;

const roleCategories = `CREATE TABLE IF NOT EXISTS role_categories (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    roleSystemId VARCHAR(128) NOT NULL,
    categoryName VARCHAR(128) NOT NULL,
    messageId VARCHAR(128) NOT NULL
)`;

const roles = `CREATE TABLE IF NOT EXISTS roles (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    categoryId BIGINT NOT NULL,
    roleId VARCHAR(128) NOT NULL,
    roleName VARCHAR(128) NOT NULL,
    reaction VARCHAR(128) NOT NULL,
    description VARCHAR(128)
)`;

const roomSystems = `CREATE TABLE IF NOT EXISTS room_systems (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    channelCategoryId VARCHAR(128) NOT NULL,
    planningChannelId VARCHAR(128) NOT NULL,
    newGameChannelId VARCHAR(128) NOT NULL
)`;

const roomSystemGames = `CREATE TABLE IF NOT EXISTS room_system_games (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    roomSystemId BIGINT NOT NULL,
    voiceChannelId VARCHAR(128) NOT NULL,
    textChannelId VARCHAR(128) NOT NULL,
    roleId VARCHAR(128) NOT NULL
)`;

const roomSystemReadyChecks = `CREATE TABLE IF NOT EXISTS room_system_ready_checks (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    gameId BIGINT NOT NULL,
    playerId VARCHAR(64) NOT NULL,
    playerTag VARCHAR(256) NOT NULL,
    readyState INT NOT NULL DEFAULT 0
)`;

const scheduledEvents = `CREATE TABLE IF NOT EXISTS scheduled_events (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    timestamp BIGINT NOT NULL,
    channelId VARCHAR(64) NOT NULL,
    messageId VARCHAR(64) NOT NULL,
    schedulingUserId VARCHAR(64) NOT NULL,
    schedulingUserTag VARCHAR(128) NOT NULL,
    eventCode VARCHAR(6) NOT NULL
)`;

const eventAttendees = `CREATE TABLE IF NOT EXISTS event_attendees (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    eventId BIGINT NOT NULL,
    userId VARCHAR(64) NOT NULL
)`;

const db = mysql.createConnection({
    host: config.dbHost,
    user: config.dbUser,
    password: config.dbPass,
    database: config.dbName,
    supportBigNumbers: true,
    bigNumberStrings: true,
});

const handler = (err) => {
    if (err) {
        console.log(err);
    }
};

db.query(guildData, handler);
db.query(roleSystems, handler);
db.query(roleCategories, handler);
db.query(roles, handler);
db.query(roomSystems, handler);
db.query(roomSystemGames, handler);
db.query(roomSystemReadyChecks, handler);
db.query(scheduledEvents, handler);
db.query(eventAttendees, handler);
db.end();
