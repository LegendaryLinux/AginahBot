const { dbQueryOne, dbExecute, getModeratorRole } = require('../lib');
const { ChannelType } = require('discord.js');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId mod-contact
  if (!interaction.hasOwnProperty('customId') || interaction.customId !== 'mod-contact') { return; }

  // If a channel already exists for this user, inform them
  let sql = `SELECT 1
             FROM mod_contact_channels mcc
             JOIN mod_contact mc ON mcc.modContactId = mc.id
             JOIN guild_data gd ON mc.guildDataId = gd.id
             WHERE gd.guildId=?
                AND mcc.userId=?
                AND mcc.resolved=0`;
  const existing = await dbQueryOne(sql, [ interaction.guild.id, interaction.user.id ]);
  if (existing) {
    await interaction.user.send('You already have an open channel to the moderators.');
    return interaction.update({});
  }

  // Fetch the moderator role id
  sql = 'SELECT moderatorRoleId FROM guild_data WHERE guildId=?';
  let guildData = await dbQueryOne(sql, [interaction.guild.id]);
  if (!guildData) { throw new Error(`Unable to find moderator role for guild: ${interaction.guild.id}`); }

  // Create the channel for discussion
  const channel = await interaction.message.channel.parent.create({
    name: interaction.user.username,
    type: ChannelType.GuildText,
    topic: `This channel was created by ${interaction.user.username}#${interaction.user.discriminator}.`,
    permissionOverwrites: [
      {
        // @everyone may not view this channel
        id: interaction.guild.id,
        deny: [ 'VIEW_CHANNEL' ],
      },
      {
        // Moderators may view this channel
        id: guildData.moderatorRoleId,
        allow: [ 'VIEW_CHANNEL' ],
      },
      {
        // The reporting user may view this channel
        id: interaction.user.id,
        allow: [ 'VIEW_CHANNEL' ],
      },
      {
        // @AginahBot may view this channel
        id: client.user.id,
        allow: [ 'VIEW_CHANNEL' ],
      }
    ],
  });

  // Send an introductory message to the channel
  const modRole = await getModeratorRole(interaction.guild);
  await channel.send(`This channel was created automatically to facilitate communication between the ${modRole} ` +
    `team and ${interaction.user}.\nWhen the issue has been resolved, a moderator may use \`.resolve\` to ` +
    'remove this channel.');

  // Fetch the id of the mod_contact entry for this guild
  sql = `SELECT mc.id
         FROM mod_contact mc
         JOIN guild_data gd ON mc.guildDataId = gd.id
         WHERE gd.guildId=?`;
  let modContact = await dbQueryOne(sql, [ interaction.guild.id ]);

  // Update the mod_contact_channels table with the new channel info
  sql = 'INSERT INTO mod_contact_channels (modContactId, userId, reportChannelId) VALUES (?, ?, ?)';
  await dbExecute(sql, [ modContact.id, interaction.user.id, channel.id ]);

  // Inform Discord the interaction was handled, but do not change the original message
  return interaction.update({});
};