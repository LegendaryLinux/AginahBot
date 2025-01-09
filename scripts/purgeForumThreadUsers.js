const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { createInterface } = require('node:readline/promises');
const config = require('../config.json');
const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');

const argv = yargs(hideBin(process.argv)).argv;
const guildId = argv.g || argv.guildId || null;
const threadId = argv.t || argv.threadId || null;
const days = argv.d || argv.days || 30;
const noPurge = argv.noPurge;

if (!guildId || !threadId) {
  console.info('Usage: node purgeForumThreadUsers.js -g guildId -t threadId [-d days=30] [--noPurge]');
  return;
}

console.info('The script will run with the following parameters:');
console.info(`Guild ID:  ${guildId}`);
console.info(`Thread ID: ${threadId}`);
console.info(`Days of message history: ${days}`);
console.info(noPurge ? 'Users will NOT be purged.' : 'Users will be purged.');

console.info('\nLogging into Discord...');
const client = new Client({
  partials: [ Partials.GuildMember, Partials.Message, Partials.Reaction ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});
client.login(config.token).then(async () => {
  console.info('Connected.');

  try {
    console.info(`\nFetching guild with id: ${guildId}`);
    const guild = await client.guilds.fetch({
      cache: true,
      force: true,
      guild: guildId,
      withCounts: false,
    });
    console.info(guild.name);

    console.info(`\nFetching thread with id: ${threadId}`);
    const thread = await guild.channels.fetch(threadId, {
      force: true,
    });
    console.info(thread.name);

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await rl.question('\nIf all that looks good, press Enter to continue. Ctrl + C to exit.');

    // Fetch message history
    const targetDate = Math.floor(new Date().getTime() - (parseInt(days, 10) * 24 * 60 * 60 * 1000));
    console.info(`\nFetching messages since ${new Date(targetDate).toISOString()}`);
    const messages = await fetchMessagesSince(thread, targetDate);
    console.info(`Found ${messages.length} messages total`);

    // Fetch full user list for thread
    console.info('\nFetching thread members');
    const threadMembers = await fetchThreadMembers(thread);
    console.debug(`Found ${threadMembers.length} members`);

    // Identify unique active thread members
    const activeUsers = new Set();
    messages.forEach((msg) => {
      activeUsers.add(msg.author.id);
    });
    console.info(`\n${activeUsers.size} unique users have sent messages in the past thirty days`);

    // Remove thread members who have not sent a message in thirty days
    console.info('Purging inactive members...');
    let totalPurgedMembers = 0;
    for (let member of threadMembers) {
      if (!activeUsers.has(member.id)) {
        console.info(`Removing ${member.user.username}`);
        if (!noPurge) {
          console.debug('PURGE');
          await thread.members.remove(member.id);
          await new Promise((resolve) => setTimeout(resolve, 500));
          ++totalPurgedMembers;
        }
      }
    }
    console.info(`Purged ${totalPurgedMembers} users`);
    console.info('Done.');

  } catch (e) {
    console.error(e);
    await client.destroy();
    process.exit(1);
  }

  await client.destroy();
  process.exit(0);
});

const fetchMessagesSince = async (threadChannel, oldestTimestamp, limit=100, messageCache=[]) => {
  // Fetch messages prior to the oldest (first) message in the cache
  const messages = await threadChannel.messages.fetch({
    limit: limit,
    before: messageCache[0]?.id || null,
  });

  // Prepend newly fetched messages to the front of a working array
  const msgArray = [];
  const foundMessages = messages.map((m) => m).reverse();
  for (let msg of foundMessages) {
    if (msg.createdTimestamp >= oldestTimestamp) {
      msgArray.push(msg);
    }
  }
  msgArray.push(...messageCache);

  // If no more messages are available, return what was found
  if (foundMessages.length < limit) {
    // Return messages
    return msgArray;
  }

  // Wait half a second to prevent rate-limiting
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Fetch more messages if the desired timestamp has not been reached
  if (parseInt(msgArray[0].createdTimestamp, 10) >= parseInt(oldestTimestamp, 10)) {
    console.info(`\n${new Date(msgArray[0].createdTimestamp).toISOString()}`);
    console.info(`Message count: ${msgArray.length}`);
    return await fetchMessagesSince(threadChannel, oldestTimestamp, limit, msgArray);
  }

  // Return messages
  return msgArray;
};

const fetchThreadMembers = async (threadChannel, limit=100, userCache=[]) => {
  const members = await threadChannel.members.fetch({
    limit,
    after: userCache[0]?.id || null,
    withMember: true,
  });

  const userArray = [...userCache];
  members.each((member) => {
    if (!member.bot) {
      userArray.push(member);
    }
  });

  if (members.size < limit) {
    return userArray;
  }

  console.info(`User count: ${userArray.length}`);
  return await fetchThreadMembers(threadChannel, limit, userArray);
};