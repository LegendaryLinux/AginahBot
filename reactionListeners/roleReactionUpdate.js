const { parseEmoji, dbQueryOne } = require('../lib');

module.exports = async (client, messageReaction, user, added) => {
  // Do nothing if the user is a bot or the message is a DM
  if (user.bot || !messageReaction.message.guild) { return; }

  // Grab the guild this reaction is a part of
  const guild = messageReaction.message.guild;

  // Ensure the emoji is usable by the server, not just the user
  const emoji = parseEmoji(guild, messageReaction.emoji.toString());
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

  // Get the matching role from the guild
  const roleObj = guild.roles.resolve(role.roleId);
  if (!roleObj) { throw new Error(`Guild ${guild.name} (${guild.id}) does not have a role ${role.roleName} ` +
    `(${role.roleId})`); }

  // Identify the user associated with this reaction
  let guildMember = guild.members.resolve(user.id);
  if (!guildMember) {
    return console.error(`User with id ${user.id} caused a roleReactionUpdate event, but is not a member of ` +
      `guild ${guild.id}.`);
  }

  // Find the GuildMemberRoleManager object attached to the guild member, if present
  if (guildMember.hasOwnProperty('fetch')) {
    guildMember = await guildMember.fetch();
  }

  return added ?
    guildMember.roles.add(roleObj) :
    guildMember.roles.remove(roleObj);
};
