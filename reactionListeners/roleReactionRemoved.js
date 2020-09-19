const config = require('../config.json');
const {parseEmoji} = require('../lib');
const {generalErrorHandler} = require('../errorHandlers');

module.exports = (client, messageReaction, user, added=true) => {
    // Do nothing if the user is a bot, the message is a DM, or the reaction was removed
    if (user.bot || !messageReaction.message.guild || added) { return; }

    // Grab the guild this reaction is a part of
    const guild = messageReaction.message.guild;

    // If this reaction does not belong to a #role-request channel, do nothing
    if (messageReaction.message.channel.name !== config.roleRequestChannel) { return; }

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
                    AND rc.messageId=?
                    AND r.reaction=?`;
    client.db.get(sql, guild.id, messageReaction.message.id, emoji, (err, role) => {
        if (err) { return generalErrorHandler(err); }
        if (!role) { throw new Error(`Message with id ${messageReaction.message.id} appears to be part of a ` +
            `${config.roleRequestChannel} channel, but does not appear in the database for guild ` +
            `${guild.name} (${guild.id}).`); }

        // Get the matching role from the guild
        const roleObj = guild.roles.resolve(role.roleId);
        if (!roleObj) { throw new Error(`Guild ${guild.name} (${guild.id}) does not have a role ${role.roleName} ` +
            `(${role.roleId})`); }

        // Add the role to the user
        guild.members.resolve(user.id).roles.remove(roleObj);
    });
};