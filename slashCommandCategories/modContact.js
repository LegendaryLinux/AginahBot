const { dbQueryOne, dbExecute, getModeratorRole } = require('../lib');
const { ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ActionRowBuilder,
  SlashCommandBuilder, PermissionFlagsBits, Client, Guild, GuildMember, TextChannel } = require('discord.js');

module.exports = {
  category: 'Mod Contact',
  commands: [
    {
      longDescription: 'Enable the Mod Contact feature in a server. This will create a category ' +
        'containing a single channel with a message where users can click on a button to contact the mods.',
      commandBuilder: new SlashCommandBuilder()
        .setName('mod-contact-enable')
        .setDescription('Enable the Mod Contact feature in this server.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        // Fetch guild data
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', interaction.guildId);

        // If the Mod Contact feature has already been enabled for this guild, inform the user
        const existing = await dbQueryOne('SELECT 1 FROM mod_contact WHERE guildDataId=?', [guildData.id]);
        if (existing) {
          return interaction.reply({
            content: 'The Mod Contact feature is already enabled for this server!',
            ephemeral: true,
          });
        }

        // The bot will now make a few requests against the Discord API and write some information to the database.
        // This might take more than five seconds, so we now defer the reply. The followUp will also be ephemeral.
        await interaction.deferReply({ ephemeral: true });

        try {
          // Create a category to contain the report channels
          const category = await interaction.guild.channels.create({
            name: 'Mod Contact',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                // @everyone may not send messages or add reactions
                id: interaction.guildId,
                deny: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions ],
              },
              {
                // @AginahBot may post in this category
                id: interaction.client.user.id,
                allow: [ PermissionsBitField.Flags.SendMessages ],
              },
            ],
          });

          const channel = await interaction.guild.channels.create({
            name: 'mod-contact',
            type: ChannelType.GuildText,
            topic: 'Privately contact the moderator team.',
            parent: category.id,
            permissionOverwrites: [
              {
                // @everyone may not send messages or add reactions
                id: interaction.guildId,
                deny: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions ],
              },
              {
                // @AginahBot may post in this channel
                id: interaction.client.user.id,
                allow: [ PermissionsBitField.Flags.SendMessages ],
              },
            ],
          });

          const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('Contact Moderators')
              .setStyle(ButtonStyle.Primary)
              .setCustomId('mod-contact')
          );

          const contactMessage = await channel.send({
            content: 'If you need to contact the moderators, simply click the button below. A private ' +
              'channel visible only to you and the moderators will be created. Your conversation will be ' +
              'confidential.',
            components: [ buttonRow ],
          });

          // Update database with mod_contact data
          let sql = 'INSERT INTO mod_contact (guildDataId, categoryId, channelId, messageId) VALUES (?, ?, ?, ?)';
          await dbExecute(sql, [ guildData.id, category.id, channel.id, contactMessage.id ]);
          return interaction.followUp('Mod contact feature enabled on this server.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the Mod Contact feature could not be enabled ' +
            'on this server. Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      },
    },
    {
      longDescription: 'Remove the Mod Contact feature from a Discord server. This also removes all ' +
        'Mod Contact history.',
      commandBuilder: new SlashCommandBuilder()
        .setName('mod-contact-disable')
        .setDescription('Remove the Mod Contact feature from this server.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        // Fetch information about this guild's mod-contact feature
        let sql = `SELECT mc.id, mc.categoryId
                   FROM mod_contact mc
                   JOIN guild_data gd ON mc.guildDataId = gd.id
                   WHERE gd.guildId = ?`;
        const modContact = await dbQueryOne(sql, [ interaction.guildId ]);

        // If the feature is not enabled, alert the user
        if (!modContact) {
          return interaction.reply({
            content: 'The Mod Contact feature is not enabled for this server.',
            ephemeral: true,
          });
        }

        try{
          // This might take a few seconds
          await interaction.deferReply({ ephemeral: true });

          // Delete entries for previous mod contact events
          await dbExecute('DELETE FROM mod_contact_channels WHERE modContactId=?', [ modContact.id ]);

          // Delete the guild category and channels
          const category = await interaction.guild.channels.fetch(modContact.categoryId);
          await category.children.cache.each(async (child) => await child.delete());
          await category.delete();

          await dbExecute('DELETE FROM mod_contact WHERE id=?', [ modContact.id ]);
          return interaction.followUp('Mod contact feature disabled on this server.');
        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the Mod Contact feature could not be enabled ' +
            'on this server. Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      },
    },
    {
      longDescription: 'Open a mod contact with a specified user.',
      commandBuilder: new SlashCommandBuilder()
        .setName('mod-contact-open')
        .setDescription('Open a mod contact with a specified user.')
        .addUserOption((opt) => opt
          .setName('user')
          .setDescription('User to open a mod-contact with')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      async execute(interaction) {
        const user = interaction.options.getUser('user', true);

        try{
          // This might take a few seconds
          await interaction.deferReply({ ephemeral: true });

          if (!await module.exports.modContactEnabled(interaction.guild)) {
            return interaction.followUp({
              content: 'The mod-contact feature is not enabled in this guild.',
              ephemeral: true,
            });
          }

          // Check if the DB believes a mod-contact exists for this user already
          const existingChannelId = await module.exports.modContactExists(interaction.guild, user);
          if (existingChannelId) {
            try {
              // Attempt to fetch this channel from the Discord API and inform the user a mod-contact already exists
              const existingChannel = await interaction.guild.channels.fetch(existingChannelId);
              return interaction.followUp({
                content: `A mod-contact is already open for this user: ${existingChannel}`,
                ephemeral: true,
              });
            } catch (e) {
              // The database claims this channel exists, but the Discord API disagrees. Set this mod contact as
              // resolved and allow the system to open a new one. This can happen if a mod-contact user channel
              // is manually deleted, or if Discord is just having a bad day
              let sql = `UPDATE mod_contact_channels
                         SET resolved=1, resolutionTime=UNIX_TIMESTAMP()
                         WHERE userId=?
                           AND reportChannelId=?`;
              await dbExecute(sql, [user.id, existingChannelId]);
            }
          }

          // Create the mod-contact channel
          const modContact = await module.exports.createModContact(interaction, user);
          return interaction.followUp({
            content: `Mod-contact created: ${modContact}`,
            ephemeral: true,
          });

        } catch (e) {
          console.error(e);
          return interaction.followUp('Something went wrong and the Mod Contact feature could not be enabled ' +
            'on this server. Please report this bug on [AginahBot\'s Discord](https://discord.gg/2EZNrAw9Ja)');
        }
      },
    }
  ],

  /**
   * Checks if the mod contact is enabled for a guild.
   * @param guild {Guild} The interaction object.
   * @returns {Promise<boolean>} A Promise that resolves to true if mod contact is enabled, otherwise false.
   */
  modContactEnabled: async (guild) => {
    let sql = `SELECT 1
               FROM mod_contact mc
               JOIN guild_data gd ON mc.guildDataId = gd.id
               WHERE gd.guildId=?`;
    return !!await dbQueryOne(sql, [guild.id]);
  },

  /**
   * Check if a mod-contact exists for a specified user. Resolves to the channelId in the specified guild if
   * a mod contact already exists
   * @param guild {Guild}
   * @param guildMember {GuildMember}
   * @returns {Promise<TextChannel|null>}
   */
  modContactExists: async (guild, guildMember) => {
    // If a channel already exists for this user, inform them
    let sql = `SELECT mcc.reportChannelId
               FROM mod_contact_channels mcc
               JOIN mod_contact mc ON mcc.modContactId = mc.id
               JOIN guild_data gd ON mc.guildDataId = gd.id
               WHERE gd.guildId=?
                  AND mcc.userId=?
                  AND mcc.resolved=0`;
    const existing = await dbQueryOne(sql, [ guild.id, guildMember.id ]);
    return existing?.reportChannelId || null;
  },

  /**
   * Open a mod-contact channel for a specified user and return the channel
   * @param interaction
   * @param guildMember {GuildMember}
   * @returns {Promise<TextChannel>}
   */
  createModContact: async (interaction, guildMember) => {
    // Fetch the moderator role
    let moderatorRole = await getModeratorRole(interaction.guild);
    if (!moderatorRole) { throw new Error(`Unable to find moderator role for guild: ${interaction.guild.id}`); }

    // Find the id of the "Mod Contact" category in this guild
    let sql = `SELECT mc.id, mc.categoryId
               FROM mod_contact mc
               JOIN guild_data gd ON mc.guildDataId = gd.id
               WHERE gd.guildId=?`;
    const modContact = await dbQueryOne(sql, [interaction.guild.id]);

    // Create the channel for discussion
    const channel = await interaction.guild.channels.create({
      name: guildMember.displayName,
      type: ChannelType.GuildText,
      parent: modContact.categoryId,
      topic: `This mod-contact channel was created by ${interaction.member.displayName}.`,
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
          // The target user may view this channel
          id: guildMember.id,
          allow: [ PermissionsBitField.Flags.ViewChannel ],
        },
        {
          // @AginahBot may view this channel
          id: interaction.client.user.id,
          allow: [ PermissionsBitField.Flags.ViewChannel ],
        }
      ],
    });

    // Send an introductory message to the channel
    const modRole = await getModeratorRole(interaction.guild);
    await channel.send(`This channel was created automatically to facilitate communication between the ${modRole} ` +
      `team and ${guildMember}.\nWhen the issue has been resolved, a moderator may use \`.resolve\` to ` +
      'remove this channel.');

    // Update the mod_contact_channels table with the new channel info
    sql = 'INSERT INTO mod_contact_channels (modContactId, userId, reportChannelId) VALUES (?, ?, ?)';
    await dbExecute(sql, [ modContact.id, guildMember.id, channel.id ]);

    // Return the newly created channel
    return channel;
  },
};

