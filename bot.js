const { Client, Collection, Events, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const { generalErrorHandler } = require('./errorHandlers');
const { handleGuildCreate, handleGuildDelete, verifyGuildSetups,
  cachePartial, updateScheduleBoards } = require('./lib');
const fs = require('fs');

// Catch all unhandled errors
process.on('uncaughtException', (err) => generalErrorHandler(err));
process.on('unhandledRejection', (err) => generalErrorHandler(err));

const client = new Client({
  partials: [ Partials.GuildMember, Partials.Channel, Partials.Message, Partials.Reaction ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});
client.devMode = process.argv[2] && process.argv[2] === 'dev';
client.commands = new Collection();
client.slashCommandCategories = [];
client.messageListeners = [];
client.messageDeletedListeners = [];
client.channelDeletedListeners = [];
client.reactionListeners = [];
client.interactionListeners = [];
client.voiceStateListeners = [];

// Load command category files
fs.readdirSync('./slashCommandCategories').filter((file) => file.endsWith('.js')).forEach((categoryFile) => {
  const slashCommandCategory = require(`./slashCommandCategories/${categoryFile}`);
  client.slashCommandCategories.push(slashCommandCategory);
});

// Load message listener files
fs.readdirSync('./messageListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
  const listener = require(`./messageListeners/${listenerFile}`);
  client.messageListeners.push(listener);
});

// Load message delete listener files
fs.readdirSync('./messageDeletedListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
  const listener = require(`./messageDeletedListeners/${listenerFile}`);
  client.messageDeletedListeners.push(listener);
});

// Load channel deleted listener files
fs.readdirSync('./channelDeletedListeners').filter((file) => file.endsWith('.js')).forEach((listenerFile) => {
  const listener = require(`./channelDeletedListeners/${listenerFile}`);
  client.channelDeletedListeners.push(listener);
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

// Run messages through the listeners
client.on(Events.MessageCreate, async (msg) => {
  // Fetch message if partial
  const message = await cachePartial(msg);
  if (message.member) { message.member = await cachePartial(message.member); }
  if (message.author) { message.author = await cachePartial(message.author); }

  // Ignore all bot messages
  if (message.author.bot) { return; }

  // Run the message through the message listeners
  return client.messageListeners.forEach((listener) => listener(client, message));
});

client.on(Events.MessageDelete, async (msg) => {
  // Fetch message if partial
  const message = await cachePartial(msg);
  if (message.member) { message.member = await cachePartial(message.member); }
  if (message.author) { message.author = await cachePartial(message.author); }
  if (message.channel) { message.channel = await cachePartial(message.channel); }

  // Run the message through the message delete listeners
  return client.messageDeletedListeners.forEach((listener) => listener(client, message));
});

// Run channel deleted events through the channel deleted listeners
client.on(Events.ChannelDelete, async (channel) => {
  return client.channelDeletedListeners.forEach((listener) => listener(client, channel));
});

// Run the voice states through the listeners
client.on(Events.VoiceStateUpdate, async(oldState, newState) => {
  oldState.member = await cachePartial(oldState.member);
  newState.member = await cachePartial(newState.member);
  client.voiceStateListeners.forEach((listener) => listener(client, oldState, newState));
});

// Run the reaction updates through the listeners
client.on(Events.MessageReactionAdd, async(messageReaction, user) => {
  messageReaction = await cachePartial(messageReaction);
  messageReaction.message = await cachePartial(messageReaction.message);
  client.reactionListeners.forEach((listener) => listener(client, messageReaction, user, true));
});
client.on(Events.MessageReactionRemove, async(messageReaction, user) => {
  messageReaction = await cachePartial(messageReaction);
  messageReaction.message = await cachePartial(messageReaction.message);
  client.reactionListeners.forEach((listener) => listener(client, messageReaction, user, false));
});

// Run the interactions through the interactionListeners
client.on(Events.InteractionCreate, async(interaction) => {
  // Handle slash command interactions independently of other interactions
  if (interaction.isChatInputCommand()) {
    for (const category of client.slashCommandCategories) {
      for (const listener of category.commands) {
        if (listener.commandBuilder.name === interaction.commandName) {
          return listener.execute(interaction);
        }
      }
    }

    // If this slash command has no known listener, notify the user and log a warning
    console.warn(`Unknown slash command received: ${interaction.commandName}`);
    return interaction.reply('Unknown command.');
  }

  // All other interactions are grouped together and handled independently
  client.interactionListeners.forEach((listener) => listener(client, interaction));
});

// Handle the bot being added to a new guild
client.on(Events.GuildCreate, async(guild) => handleGuildCreate(client, guild));

// Handle the bot being removed from a guild
client.on(Events.GuildDelete, async(guild) => handleGuildDelete(client, guild));

// Use the general error handler to handle unexpected errors
client.on(Events.Error, async(error) => generalErrorHandler(error));

client.once(Events.ClientReady, async () => {
  // Update data for each guild if necessary
  try{ await verifyGuildSetups(client); }
  catch (err) { console.error(err); }

  // Update all schedule boards
  try { await updateScheduleBoards(client); }
  catch (err) { console.error(err); }

  // Login and initial setup successful
  console.info(`Connected to Discord. Active in ${client.guilds.cache.size} guilds.`);

  // Update schedule boards every hour
  setInterval(() => {
    try { updateScheduleBoards(client); }
    catch (err) { console.error(err); }
  }, 60 * 60 * 1000); // 60 minutes * 60 seconds * 1000 milliseconds
});

client.login(config.token);