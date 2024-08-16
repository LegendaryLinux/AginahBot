const { dbQueryOne, dbExecute} = require('../lib');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId eventRoom
  if (!interaction.hasOwnProperty('customId') || !interaction.customId.startsWith('schedule')) { return; }

  // Identify command
  const commandParts = interaction.customId.split('-');
  const command = commandParts[1];

  let sql;
  let existingEvent = null;

  switch (command) {
    case 'rsvp':
      // Ensure event exists
      sql = `SELECT se.id
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                AND se.eventCode=?`;
      existingEvent = await dbQueryOne(sql, [interaction.guild.id, commandParts[2]]);
      if (!existingEvent) {
        return interaction.reply({
          content: 'Unable to find event.',
          ephemeral: true,
        });
      }

      await dbExecute(
        'REPLACE INTO event_rsvp (eventId, userId) VALUES (?, ?)',
        [existingEvent.id, interaction.user.id]
      );

      return interaction.reply({
        content: 'RSVP Successful.',
        ephemeral: true,
      });

    case 'rsvpCancel':
      // Ensure event exists
      sql = `SELECT se.id
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                AND se.eventCode=?`;
      existingEvent = await dbQueryOne(sql, [interaction.guild.id, commandParts[2]]);
      if (!existingEvent) {
        return interaction.reply({
          content: 'Unable to find event.',
          ephemeral: true,
        });
      }

      await dbExecute(
        'DELETE FROM event_rsvp WHERE eventId=? AND userId=?',
        [existingEvent.id, interaction.user.id]
      );

      return interaction.reply({
        content: 'RSVP Removed.',
        ephemeral: true,
      });
  }
};
