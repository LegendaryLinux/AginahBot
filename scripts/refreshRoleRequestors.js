const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');
const config = require('../config.json');
const {dbQueryOne, dbQueryAll} = require('../lib');

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ Partials.GuildMember, Partials.Message, Partials.Reaction ],
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent],
});
client.login(config.token).then(async () => {
  console.debug('Connected.');
  console.debug(`This bot has been installed in ${client.guilds.cache.size} guilds.\n`);
  const sql = `SELECT rc.messageId, rc.categoryName
               FROM role_categories rc
               JOIN role_systems rs ON rc.roleSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE gd.guildId=?`;
  for (let guild of Array.from(client.guilds.cache.values())){
    console.log(`\nWorking on guild: ${guild.name}`);
    let categories = await dbQueryAll(sql, [guild.id]);
    for (let category of categories) {
      console.log(`Updating category: ${category.categoryName}`);
      await updateCategoryMessage(client, guild, category.messageId);
    }
  }
  client.destroy();
});


const updateCategoryMessage = async (client, guild, messageId) => {
  // Fetch the target message
  let sql = `SELECT rc.id, rc.categoryName, rs.roleRequestChannelId
             FROM role_categories rc
             JOIN role_systems rs ON rc.roleSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id
             WHERE gd.guildId=?
               AND rc.messageId=?`;
  const roleCategory = await dbQueryOne(sql, [guild.id, messageId]);
  if (!roleCategory) { throw Error('Unable to update category message. Role category could not be found.'); }

  const roleInfoEmbed = {
    title: roleCategory.categoryName,
    fields: [],
  };
  sql = 'SELECT r.roleId, r.reaction, r.reactionString, r.description FROM roles r WHERE r.categoryId=?';
  const roles = await dbQueryAll(sql, [roleCategory.id]);

  const actionRows = [];
  let buttons = [];

  roles.forEach((role) => {
    const roleName = guild.roles.resolve(role.roleId).name;

    // Add an embed field for this role
    roleInfoEmbed.fields.push({
      name: `${role.reactionString} ${roleName}`,
      value: role.description || 'No description provided.',
    });

    // A maximum of five buttons are allowed per row
    if (buttons.length === 5) {
      actionRows.push(new ActionRowBuilder().addComponents(...buttons));
      buttons = [];
    }

    // Create the button for this role
    buttons.push(new ButtonBuilder()
      .setCustomId(`role-request||${role.roleId}`)
      .setLabel(' ')
      .setEmoji(role.reaction)
      .setStyle(ButtonStyle.Secondary));
  });

  // Add any remaining buttons to the embed
  if (buttons.length > 0) {
    actionRows.push(new ActionRowBuilder().addComponents(...buttons));
  }

  // If there are no roles in this category, mention that there are none
  if (roles.length === 0) {
    roleInfoEmbed.description = 'There are no roles in this category yet.';
  }

  // Fetch and edit the category message
  const roleRequestChannel = guild.channels.resolve(roleCategory.roleRequestChannelId);
  const categoryMessage = await roleRequestChannel.messages.fetch(messageId);

  const messageData = { content: null, embeds: [roleInfoEmbed] };
  if (actionRows.length > 0) {
    messageData.components = actionRows;
  }

  await categoryMessage.edit(messageData);
  await categoryMessage.reactions.removeAll();
};