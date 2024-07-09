const mysql = require('mysql2');
const config = require('./config.json');

const guildData = `CREATE TABLE IF NOT EXISTS guild_data (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildId VARCHAR(64) NOT NULL UNIQUE,
    moderatorRoleId VARCHAR(64) NOT NULL,
    googleCalendarId VARCHAR(128)
)`;

const roleSystems = `CREATE TABLE IF NOT EXISTS role_systems (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL UNIQUE,
    roleRequestChannelId VARCHAR(64) NOT NULL
)`;

const roleCategories = `CREATE TABLE IF NOT EXISTS role_categories (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    roleSystemId BIGINT NOT NULL,
    categoryName VARCHAR(128) NOT NULL,
    messageId VARCHAR(64) NOT NULL
)`;

const roles = `CREATE TABLE IF NOT EXISTS roles (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    categoryId BIGINT NOT NULL,
    roleId VARCHAR(64) NOT NULL,
    roleName VARCHAR(128) NOT NULL,
    reaction VARCHAR(128) NOT NULL,
    reactionString VARCHAR(128) NOT NULL,
    description VARCHAR(128)
)`;

const roleMessages = `CREATE TABLE IF NOT EXISTS role_messages (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    channelId VARCHAR(128) NOT NULL,
    messageId VARCHAR(128) NOT NULL,
    roleId VARCHAR(128) NOT NULL
)`;

const roomSystems = `CREATE TABLE IF NOT EXISTS room_systems (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    channelCategoryId VARCHAR(64) NOT NULL,
    newGameChannelId VARCHAR(64) NOT NULL
)`;

const roomSystemGames = `CREATE TABLE IF NOT EXISTS room_system_games (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    roomSystemId BIGINT NOT NULL,
    voiceChannelId VARCHAR(64) NOT NULL,
    textChannelId VARCHAR(64) NOT NULL,
    roleId VARCHAR(64) NOT NULL
)`;

const roomSystemReadyChecks = `CREATE TABLE IF NOT EXISTS room_system_ready_checks (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    gameId BIGINT NOT NULL,
    playerId VARCHAR(64) NOT NULL,
    playerName VARCHAR(256) NOT NULL,
    readyState TINYINT NOT NULL DEFAULT 0
)`;

const scheduledEvents = `CREATE TABLE IF NOT EXISTS scheduled_events (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    timestamp BIGINT NOT NULL,
    channelId VARCHAR(64) NOT NULL,
    messageId VARCHAR(64) NOT NULL,
    threadId VARCHAR(64),
    schedulingUserId VARCHAR(64) NOT NULL,
    eventCode VARCHAR(6) NOT NULL,
    title VARCHAR(100),
    duration BIGINT UNSIGNED,
    googleEventId VARCHAR(128)
)`;

const modContact = `CREATE TABLE IF NOT EXISTS mod_contact (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    categoryId VARCHAR(64) NOT NULL,
    channelId VARCHAR(64) NOT NULL,
    messageId VARCHAR(64) NOT NULL
)`;

const modContactChannels = `CREATE TABLE IF NOT EXISTS mod_contact_channels (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    modContactId BIGINT NOT NULL,
    userId VARCHAR(64) NOT NULL,
    reportChannelId VARCHAR(64) NOT NULL,
    reportTime BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    resolved TINYINT(1) NOT NULL DEFAULT 0,
    resolutionTime BIGINT
)`;

const messageTags = `CREATE TABLE IF NOT EXISTS message_tags (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    tagName VARCHAR(32) NOT NULL,
    tagContent TEXT(1024) NOT NULL,
    createdByUserId VARCHAR(64) NOT NULL,
    createdTime BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    UNIQUE KEY guildDataId (guildDataId, tagName)
)`;

const guildOptions = `CREATE TABLE IF NOT EXISTS guild_options (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT,
  guildDataId BIGINT UNSIGNED NOT NULL,
  eventThreads TINYINT(1) NOT NULL DEFAULT 0,
  roleWhitelist TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY guildDataId (guildDataId)
)`;

const pingableRoles = `CREATE TABLE IF NOT EXISTS pingable_roles (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  guildDataId BIGINT NOT NULL,
  roleId VARCHAR(64) NOT NULL,
  UNIQUE KEY guildDataId (guildDataId, roleId)
)`;

const pinPermissions = `CREATE TABLE IF NOT EXISTS pin_permissions (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT UNSIGNED NOT NULL,
    channelId VARCHAR(64) NOT NULL,
    userId VARCHAR(64) NOT NULL,
    UNIQUE KEY guildChannelUser (guildDataId, channelId, userId)
)`;

const scheduleBoards = `CREATE TABLE IF NOT EXISTS schedule_boards (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    guildDataId BIGINT NOT NULL,
    channelId VARCHAR(64) NOT NULL,
    messageId VARCHAR(64) NOT NULL
)`;

const db = mysql.createConnection({
  host: config.dbHost,
  user: config.dbUser,
  password: config.dbPass,
  database: config.dbName,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

const handler = (err) => console.log(err);

db.query(guildData, handler);
db.query(roleSystems, handler);
db.query(roleCategories, handler);
db.query(roles, handler);
db.query(roleMessages, handler);
db.query(roomSystems, handler);
db.query(roomSystemGames, handler);
db.query(roomSystemReadyChecks, handler);
db.query(scheduledEvents, handler);
db.query(modContact, handler);
db.query(modContactChannels, handler);
db.query(messageTags, handler);
db.query(guildOptions, handler);
db.query(pingableRoles, handler);
db.query(pinPermissions, handler);
db.query(scheduleBoards, handler);
db.end();
