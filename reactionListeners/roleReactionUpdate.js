const { parseEmoji, dbQueryOne } = require('../lib');
const {generalErrorHandler} = require('../errorHandlers');

module.exports = async (client, messageReaction, user, added) => {
  // Do nothing if the user is a bot or the message is a DM
  if (user.bot || !messageReaction.message.guild) { return; }

  // Grab the guild this reaction is a part of
  const guild = messageReaction.message.guild;

  // Ensure the emoji is usable by the server, not just the user
  const emoji = await parseEmoji(guild, messageReaction.emoji.toString());
  if (!emoji) { return; }

  // Fetch the role associated with this message
  let sql = `SELECT r.roleId, r.roleName
             FROM roles r
             JOIN role_categories rc ON r.categoryId = rc.id
             JOIN role_systems rs ON rc.roleSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id
             WHERE gd.guildId=?
               AND rs.roleRequestChannelId=?
               AND rc.messageId=?
               AND r.reaction=?`;
  const role = await dbQueryOne(sql, [guild.id, messageReaction.message.channel.id,
    messageReaction.message.id, emoji.toString()]);
  if (!role) { return; }

  let roleObj = null;
  try {
    // Get the matching role from the guild
    roleObj = await guild.roles.fetch(role.roleId);
  } catch (err) {
    if (err.status === 404) {
      throw new Error(`Unable to fetch object for role [${role.roleName} / ${role.roleId}] during a ` +
        `roleReactionUpdate because the role does not exist in the guild [${guild.name} / ${guild.id}].`);
    }
    return generalErrorHandler(err);
  }

  // Identify the user associated with this reaction
  let guildMember = guild.members.resolve(user.id);
  if (!guildMember) {
    // If the user sent a roleReactionUpdate but is not a member of the guild, simply do nothing.
    // This can occur if a user is browsing a server but has not officially joined the server, meaning they
    // do not have a GuildMember object.
    return;
  }

  // Find the GuildMemberRoleManager object attached to the guild member, if present
  if (guildMember.hasOwnProperty('fetch')) {
    guildMember = await guildMember.fetch();
  }

  try {
    return added ?
      guildMember.roles.add(roleObj) :
      guildMember.roles.remove(roleObj);
  } catch (err) {
    if (err.status === 403) {
      await user.send('I couldn\'t assign you that role because I don\'t have permission to do so. ' +
        'You should tell an admin or moderator about this.');
    }
    generalErrorHandler(err);
  }
};
