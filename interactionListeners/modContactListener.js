const { dbQueryOne, dbExecute, getModeratorRole } = require('../lib');
const { ChannelType, PermissionsBitField } = require('discord.js');

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

  // Fetch the moderator role
  let moderatorRole = await getModeratorRole(interaction.guild);
  if (!moderatorRole) { throw new Error(`Unable to find moderator role for guild: ${interaction.guild.id}`); }

  // Create the channel for discussion
  const channel = await interaction.message.guild.channels.create({
    name: interaction.member.displayName,
    type: ChannelType.GuildText,
    parent: interaction.message.channel.parent.id,
    topic: `This channel was created by ${interaction.member.displayName}.`,
    permissionOverwrites: [
      {
        // @everyone may not view this channel
        id: interaction.guild.id,
        deny: [ PermissionsBitField.Flags.ViewChannel ],
      },
      {
        // Moderators may view this channel
        id: moderatorRole.id,
        allow: [ PermissionsBitField.Flags.ViewChannel ],
      },
      {
        // The reporting user may view this channel
        id: interaction.user.id,
        allow: [ PermissionsBitField.Flags.ViewChannel ],
      },
      {
        // @AginahBot may view this channel
        id: client.user.id,
        allow: [ PermissionsBitField.Flags.ViewChannel ],
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