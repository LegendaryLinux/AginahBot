const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('../config.json');

const guildId = process.argv[2] || null;
const threadId = process.argv[3] || null;

if (!guildId || !threadId) {
  console.info('Usage: node purgeForumThreadUsers.js guildId threadId\n');
  return;
}

console.info('Logging into Discord...');
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

    // Fetch message history up to thirty days
    const targetDate = Math.floor(new Date().getTime() - (30 * 24 * 60 * 60 * 1000));
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
    for (let member of threadMembers) {
      if (!activeUsers.has(member.id)) {
        console.info(`Removing ${member.user.username}`);
        await thread.members.remove(member.id);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    console.info('Done.');

  } catch (e) {
    console.error(e);
    return client.destroy();
  }

  return client.destroy();
});

const fetchMessagesSince = async (threadChannel, afterTimestamp, limit=100, messageCache=[]) => {
  // Fetch messages prior to the oldest (first) message in the cache
  const messages = await threadChannel.messages.fetch({
    limit: limit,
    before: messageCache[0]?.id || null,
  });

  // Prepend newly fetched messages to the front of a working array. Ignore messages whose users are
  // not members of the thread
  const msgArray = [];
  messages.each((msg) => {
    if (msg.createdTimestamp > afterTimestamp) {
      msgArray.push(msg);
    }
  });
  msgArray.push(...messageCache);

  // If no more messages are available, return what was found
  if (messages.size < limit) {
    return msgArray;
  }

  // Wait half a second to prevent rate-limiting
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Fetch more messages if the desired timestamp has not been reached
  if (msgArray[0].createdTimestamp > afterTimestamp) {
    console.info(`Message count: ${msgArray.length}`);
    return await fetchMessagesSince(threadChannel, afterTimestamp, limit, msgArray);
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