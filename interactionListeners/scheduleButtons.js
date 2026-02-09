const { dbQueryOne, dbExecute} = require('../lib');
const {generalErrorHandler} = require('../errorHandlers');
const { MessageFlags } = require('discord.js');

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
      sql = `SELECT se.id, se.threadId
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                AND se.eventCode=?`;
      existingEvent = await dbQueryOne(sql, [interaction.guild.id, commandParts[2]]);
      if (!existingEvent) {
        return interaction.reply({
          content: 'Unable to find event.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Add user to RSVP list
      await dbExecute(
        'REPLACE INTO event_rsvp (eventId, userId) VALUES (?, ?)',
        [existingEvent.id, interaction.user.id]
      );

      // If there is a thread, add the user to it
      if (existingEvent.threadId) {
        try{
          const eventThread = await interaction.guild.channels.fetch(existingEvent.threadId);
          await eventThread.members.add(interaction.user);
        } catch (err) {
          // Ignore failures caused by missing threads (deleted) and users already existing in a thread
          generalErrorHandler(err);
        }
      }

      return interaction.reply({
        content: 'RSVP Successful.',
        flags: MessageFlags.Ephemeral,
      });

    case 'rsvpCancel':
      // Ensure event exists
      sql = `SELECT se.id, se.threadId
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE gd.guildId=?
                AND se.eventCode=?`;
      existingEvent = await dbQueryOne(sql, [interaction.guild.id, commandParts[2]]);
      if (!existingEvent) {
        return interaction.reply({
          content: 'Unable to find event.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Remove user from RSVP list
      await dbExecute(
        'DELETE FROM event_rsvp WHERE eventId=? AND userId=?',
        [existingEvent.id, interaction.user.id]
      );

      // If there is a thread, remove the user from it
      if (existingEvent.threadId) {
        try{
          const eventThread = await interaction.guild.channels.fetch(existingEvent.threadId);
          await eventThread.members.remove(interaction.user);
        } catch (err) {
          // Ignore failures caused by missing threads (deleted) and by users already having left the thread
          generalErrorHandler(err);
        }
      }

      return interaction.reply({
        content: 'RSVP Removed.',
        flags: MessageFlags.Ephemeral,
      });
  }
};
