const { generalErrorHandler } = require('../errorHandlers');
const { dbQueryOne, dbExecute } = require('../lib');

const DEFAULT_ROLE_NAME = "Dynamic Room Category"
const VOICE_CHANNEL_NAME = 'Start Game';

module.exports = {
  category: "Dynamic Room Systems",
  commands: [
    {
      name: 'create-room-system',
      description: 'Add a dynamic room system to this server. It will automatically create voice and text ' +
        'channels on demand.',
      longDescription: null,
      aliases: ['crs'],
      usage: '`!aginah create-room-system [categoryName]`',
      guildOnly: true,
      minimumRole: null,
      adminOnly: true,
      async execute(message, args) {
        // Create the system
        const roleName = args[0] ? args[0] : DEFAULT_ROLE_NAME;
        const category = await message.guild.channels.create(roleName, { type: 'GUILD_CATEGORY' });
        const voiceChannel = await message.guild.channels.create(VOICE_CHANNEL_NAME, {
          type: 'GUILD_VOICE', parent: category
        });
        const guildData = await dbQueryOne(`SELECT id FROM guild_data WHERE guildId=?`, [message.guild.id]);
        let sql = `INSERT INTO room_systems (guildDataId, channelCategoryId, newGameChannelId) VALUES (?, ?, ?)`;
        await dbExecute(sql, [guildData.id, category.id, voiceChannel.id]);
      }
    },
    {
      name: 'destroy-room-system',
      description: 'Remove a role system system from this server.',
      longDescription: null,
      aliases: [],
      usage: '`!aginah destroy-room-system categoryName`',
      guildOnly: true,
      minimumRole: null,
      adminOnly: true,
      async execute(message, args) {
        if (!args[0]) {
          return message.channel.send('You must provide the name of the dynamic room system to delete.\n' +
            '`!aginah help destroy-room-system` for more info.');
        }

        const guild = await message.guild.fetch();
        // Find a category whose name matches the argument
        const category = guild.channels.cache.find((el) => el.name === args[0]);

        // If no category matching the provided argument was found, inform the user
        if (!category) { return message.channel.send('No dynamic room category with that name exists!'); }

        let sql = `SELECT rs.id
                     FROM room_systems rs
                     JOIN guild_data gd ON rs.guildDataId = gd.id
                     WHERE channelCategoryId=?
                       AND gd.guildId=?`;
        const row = await dbQueryOne(sql, [category.id, message.guild.id]);
        if (!row) {
          return message.channel.send('Your server does not have a dynamic room category with that name.');
        }

        await category.children.each(async (channel) => await channel.delete());
        await category.delete();
        await dbExecute(`DELETE FROM room_system_games WHERE roomSystemId=?`, [row.id]);
        await dbExecute(`DELETE FROM room_systems WHERE id=?`, [row.id]);
      }
    },
  ],
};
