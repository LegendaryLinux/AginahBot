const Discord = require('discord.js')
const sqlite3 = require('sqlite3');
const dbSetup = require('./dbSetup')
const config = require('./config.json');
const {generalErrorHandler} = require('./errorHandlers');
const { verifyModeratorRole, verifyIsAdmin, handleGuildCreate, handleGuildDelete,
    verifyGuildSetups, populateBotCache } = require('./lib');
const fs = require('fs');

// Catch all unhandled errors
process.on('uncaughtException', (err) => generalErrorHandler(err));

// Build the database if it does not exist
dbSetup();

const client = new Discord.Client();
client.db = new sqlite3.Database(config.dbFile);
client.commands = new Discord.Collection();
client.commandCategories = [];
client.messageListeners = [];
client.reactionListeners = [];
client.voiceStateListeners = [];

// Load command category files
fs.readdirSync('./commandCategories').filter((file) => file.endsWith('.js')).forEach((categoryFile) => {
    const commandCategory = require(`./commandCategories/${categoryFile}`);
    client.commandCategories.push(commandCategory);
    commandCategory.commands.forEach((command) => {
        client.commands.set(command.name, command);
    });
});

// Load message listener files
fs.readdirSync('./messageListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
    const listener = require(`./messageListeners/${listenerFile}`);
    client.messageListeners.push(listener);
});

// Load reaction listener files
fs.readdirSync('./reactionListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
    const listener = require(`./reactionListeners/${listenerFile}`);
    client.reactionListeners.push(listener);
});

// Load voice state listener files
fs.readdirSync('./voiceStateListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
    const listener = require(`./voiceStateListeners/${listenerFile}`);
    client.voiceStateListeners.push(listener);
});

client.on('message', (message) => {
    // Ignore all bot messages
    if (message.author.bot) { return; }

    // If the message does not begin with the command prefix, run it through the message listeners
    if (!message.content.startsWith(config.commandPrefix)) {
        return client.messageListeners.forEach((listener) => listener(client, message));
    }

    // If the message is a command, parse the command and arguments
    // TODO: Allow arguments to be enclosed in single or double quotes
    const args = message.content.slice(config.commandPrefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    try{
        // Get the command object
        const command = client.commands.get(commandName) ||
            client.commands.find((cmd) => cmd.aliases && cmd.aliases.includes(commandName));

        // If the command does not exist, alert the user
        if (!command) { return message.channel.send("I don't know that command. Use `!aginah help` for more info."); }

        // If the command does not require a guild, just run it
        if (!command.guildOnly) { return command.execute(message, args); }

        // If this message was not sent from a guild, deny it
        if (!message.guild) { return message.reply('That command may only be used in a server.'); }

        // If the command is available only to administrators, run it only if the user is an administrator
        if (command.adminOnly) {
            if (verifyIsAdmin(message.member)) {
                return command.execute(message, args);
            } else {
                // If the user is not an admin, warn them and bail
                return message.author.send("You do not have permission to use that command.");
            }
        }

        // If the command is available to everyone, just run it
        if (!command.minimumRole) { return command.execute(message, args); }

        // Otherwise, the user must have permission to access this command
        if (verifyModeratorRole(message.member)) {
            return command.execute(message, args);
        }

        return message.reply('You are not authorized to use that command.');
    }catch (error) {
        // Log the error, report a problem
        console.error(error);
        message.reply("Something broke. Maybe check your command?")
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    // Run the voice states through the listeners
    client.voiceStateListeners.forEach((listener) => listener(client, oldState, newState));
});

// Run the reaction updates through the listeners
client.on('messageReactionAdd', (messageReaction, user) =>
    client.reactionListeners.forEach((listener) => listener(client, messageReaction, user, true)));
client.on('messageReactionRemove', (messageReaction, user) =>
    client.reactionListeners.forEach((listener) => listener(client, messageReaction, user, false)));

// Handle the bot being added to a new guild
client.on('guildCreate', (guild) => handleGuildCreate(client, guild));

// Handle the bot being removed from a guild
client.on('guildDelete', (guild) => handleGuildDelete(client, guild));

// Use the general error handler to handle unexpected errors
client.on('error', (error) => generalErrorHandler(error));

client.once('ready', () => {
    verifyGuildSetups(client);
    populateBotCache(client);
    console.log(`Connected to Discord. Active in ${client.guilds.cache.array().length} guilds.`);
});

client.login(config.token);
