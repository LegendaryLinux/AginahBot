const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { dbQueryOne, dbExecute } = require('../lib');

module.exports = {
  category: 'Role Whitelist',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-whitelist-enable')
        .setDescription('Enable the whitelist system for role pings on scheduled events')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        await interaction.deferReply({ephemeral: true});

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          await interaction.followUp({ content: 'Something went wrong, and your request was not processed.' });
          return console.error(`guildId ${interaction.guild.id} does not exist in the guild_data table.`);
        }

        await dbExecute('UPDATE guild_options SET roleWhitelist=1 WHERE guildDataId=?', [guildData.id]);
        return interaction.followUp({
          content: 'Role whitelist enabled for this server.',
          ephemeral: true,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-whitelist-disable')
        .setDescription('Disable the whitelist system for role pings on scheduled events')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        await interaction.deferReply({ephemeral: true});

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          await interaction.followUp({ content: 'Something went wrong, and your request was not processed.' });
          return console.error(`guildId ${interaction.guild.id} does not exist in the guild_data table.`);
        }

        await dbExecute('UPDATE guild_options SET roleWhitelist=0 WHERE guildDataId=?', [guildData.id]);
        await dbExecute('DELETE FROM pingable_roles WHERE guildDataId=?', [guildData.id]);
        return interaction.followUp({
          content: 'Role whitelist disabled for this server.',
          ephemeral: true,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-whitelist-add')
        .setDescription('Grant permission for the bot to ping the specified role.')
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('The role to be whitelisted')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const role = interaction.options.getRole('role', true);
        await interaction.deferReply({ephemeral: true});

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          await interaction.followUp({ content: 'Something went wrong, and your request was not processed.' });
          return console.error(`guildId ${interaction.guild.id} does not exist in the guild_data table.`);
        }

        let sql = 'SELECT 1 FROM guild_options WHERE guildDataId=? AND roleWhitelist=1';
        const guildOptions = await dbQueryOne(sql, [guildData.id]);
        if (!guildOptions) {
          return interaction.followUp({ content: 'The role whitelist is not enabled for this server.' });
        }

        await dbExecute('REPLACE INTO pingable_roles (guildDataId, roleId) VALUES (?, ?)', [guildData.id, role.id]);
        return interaction.followUp({ content: `Permission for the bot to ping ${role} has been granted.` });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-whitelist-delete')
        .setDescription('Deny permission for the bot to ping the specified role.')
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('The role to be removed from the whitelist')
          .setRequired(true))
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const role = interaction.options.getRole('role', true);
        await interaction.deferReply({ephemeral: true});

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          await interaction.followUp({ content: 'Something went wrong, and your request was not processed.' });
          return console.error(`guildId ${interaction.guild.id} does not exist in the guild_data table.`);
        }

        let sql = 'SELECT 1 FROM guild_options WHERE guildDataId=? AND roleWhitelist=1';
        const guildOptions = await dbQueryOne(sql, [guildData.id]);
        if (!guildOptions) {
          return interaction.followUp({ content: 'The role whitelist is not enabled for this server.' });
        }

        await dbExecute('DELETE FROM pingable_roles WHERE guildDataId=? AND roleId=?', [guildData.id, role.id]);
        return interaction.followUp({ content: `Permission for the bot to ping ${role} has been revoked.` });
      }
    },
  ],
};
