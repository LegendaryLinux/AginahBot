const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('./config.json');
const { generalErrorHandler } = require('./errorHandlers');
const { verifyModeratorRole, verifyIsAdmin, handleGuildCreate, handleGuildDelete,
  verifyGuildSetups, cachePartial, parseArgs, updateScheduleBoards, cacheRoleSystem } = require('./lib');
const fs = require('fs');

// Catch all unhandled errors
process.on('uncaughtException', (err) => generalErrorHandler(err));
process.on('unhandledRejection', (err) => generalErrorHandler(err));

const client = new Client({
  partials: [ 'GUILD_MEMBER', 'MESSAGE', 'REACTION' ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});
client.devMode = process.argv[2] && process.argv[2] === 'dev';
client.commands = new Collection();
client.commandCategories = [];
client.messageListeners = [];
client.reactionListeners = [];
client.interactionListeners = [];
client.channelDeletedListeners = [];
client.voiceStateListeners = [];
client.tempData = {
  voiceRooms: new Map(),
  apInterfaces: new Map(),
};

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

// Load interaction listeners
fs.readdirSync('./interactionListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
  const listener = require(`./interactionListeners/${listenerFile}`);
  client.interactionListeners.push(listener);
});

fs.readdirSync('./channelDeletedListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
  const listener = require(`./channelDeletedListeners/${listenerFile}`);
  client.channelDeletedListeners.push(listener);
});

client.on('messageCreate', async (msg) => {
  // Fetch message if partial
  const message = await cachePartial(msg);
  if (message.member) { message.member = await cachePartial(message.member); }
  if (message.author) { message.author = await cachePartial(message.author); }

  // Ignore all bot messages
  if (message.author.bot) { return; }

  // If the message does not begin with the command prefix, run it through the message listeners
  if (!message.content.startsWith(config.commandPrefix)) {
    return client.messageListeners.forEach((listener) => listener(client, message));
  }

  // If the message is a command, parse the command and arguments
  const args = parseArgs(message.content.slice(config.commandPrefix.length).trim());
  const commandName = args.shift().toLowerCase();

  try{
    // Get the command object
    const command = client.commands.get(commandName) ||
            client.commands.find((cmd) => cmd.aliases && cmd.aliases.includes(commandName));
    // If the command does not exist, alert the user
    if (!command) { return message.channel.send('I do not know that command. Use `!aginah help` for more info.'); }

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
        return message.author.send('You do not have permission to use that command.');
      }
    }

    // If the command is available to everyone, just run it
    if (!command.moderatorRequired) { return command.execute(message, args); }

    // Otherwise, the user must have permission to access this command
    if (await verifyModeratorRole(message.member)) {
      return command.execute(message, args);
    }

    return message.reply('You are not authorized to use that command.');
  }catch (error) {
    // Log the error, report a problem
    console.error(error);
    message.reply('Something broke. Maybe check your command?');
  }
});

// Run the voice states through the listeners
client.on('voiceStateUpdate', async(oldState, newState) => {
  oldState.member = await cachePartial(oldState.member);
  newState.member = await cachePartial(newState.member);
  client.voiceStateListeners.forEach((listener) => listener(client, oldState, newState));
});

// Run the reaction updates through the listeners
client.on('messageReactionAdd', async(messageReaction, user) => {
  messageReaction = await cachePartial(messageReaction);
  messageReaction.message = await cachePartial(messageReaction.message);
  client.reactionListeners.forEach((listener) => listener(client, messageReaction, user, true));
});
client.on('messageReactionRemove', async(messageReaction, user) => {
  messageReaction = await cachePartial(messageReaction);
  messageReaction.message = await cachePartial(messageReaction.message);
  client.reactionListeners.forEach((listener) => listener(client, messageReaction, user, false));
});

// Run the interactions through the interactionListeners
client.on('interactionCreate', async(interaction) => {
  client.interactionListeners.forEach((listener) => listener(client, interaction));
});

// Run channelDelete events through their listeners
client.on('channelDelete', async(channel) => {
  client.channelDeletedListeners.forEach((listener) => listener(client, channel));
});

// Handle the bot being added to a new guild
client.on('guildCreate', async(guild) => handleGuildCreate(client, guild));

// Handle the bot being removed from a guild
client.on('guildDelete', async(guild) => handleGuildDelete(client, guild));

// Use the general error handler to handle unexpected errors
client.on('error', async(error) => generalErrorHandler(error));

client.once('ready', async() => {
  await verifyGuildSetups(client);
  console.log(`Connected to Discord. Active in ${client.guilds.cache.size} guilds.`);

  // Fetch all role system messages into the cache so the bot can handle their reactions
  await cacheRoleSystem(client);

  // Update all schedule boards every hour
  await updateScheduleBoards(client);
  setInterval(() => updateScheduleBoards(client), 60 * 60 * 1000); // 60 minutes * 60 seconds * 1000 milliseconds
});

client.login(config.token);