const { getModeratorRole, dbQueryOne, dbQueryAll, dbExecute, parseArgs } = require('../lib');
const { PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = async (client, message) => {
  if (!message.guild) { return; }

  const command = parseArgs(message.content);
  const dotCommands = ['.ping', '.ready', '.unready', '.readycheck', '.close', '.lock', '.unlock', '.connect'];
  if (!command[0] || dotCommands.indexOf(command[0]) === -1) { return; }

  let sql = `SELECT rsrc.id AS checkId, rsg.id AS gameId, rsg.voiceChannelId
             FROM room_system_ready_checks rsrc
             JOIN room_system_games rsg ON rsrc.gameId = rsg.id
             JOIN room_systems rs ON rsg.roomSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id
             WHERE rsrc.playerId=?
               AND rsg.textChannelId=?
               AND gd.guildId=?`;
  const roomSystem = await dbQueryOne(sql, [message.author.id, message.channel.id, message.guild.id]);
  if (!roomSystem) { return; }

  // Fetch room system voice channel
  const voiceChannel = await message.guild.channels.fetch(roomSystem.voiceChannelId);

  switch(command[0]) {
    // Attendee wants to alert other attendees a game is about to start
    case '.ping':
      if (!command[1]) { return message.channel.send('You must provide a room code to ping players.'); }

      sql = `SELECT se.messageId, se.channelId, se.schedulingUserTag, se.title
             FROM scheduled_events se
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE se.eventCode=?
               AND gd.guildId=?
               AND se.timestamp > ((UNIX_TIMESTAMP()*1000) - (30*60*1000))`;
      const schedule = await dbQueryOne(sql, [command[1].toUpperCase(), message.guild.id]);
      if (!schedule) {
        return message.channel.send('There is no upcoming event with that code.');
      }

      // Fetch original scheduling message
      const channel = message.guild.channels.resolve(schedule.channelId);
      const scheduleMessage = await channel.messages.fetch(schedule.messageId);

      // Fetch all users who reacted to the scheduling message
      const attendees = new Map();
      for (let reaction of scheduleMessage.reactions.cache) {
        const users = await reaction[1].users.fetch();
        users.each((user) => {
          if (user.bot) { return; }
          if (attendees.has(user.id)) { return; }
          attendees.set(user.id, user);
        });
      }

      if (attendees.length === 0) {
        return message.channel.send('No RSVPs exist for this event, so no reminder message was sent.');
      }

      let attendeeString = '';
      for (let attendee of attendees.values()) {
        attendeeString += `${attendee} `;
      }

      // Build the reminder message
      const embed = new EmbedBuilder()
        .setTitle(`${schedule.title || 'An event'} is about to begin in #${message.channel.name}!`)
        .setColor('#6081cb')
        .addFields([
          { name: 'Original Post', value: `[Jump to Schedule Message](${scheduleMessage.url})` },
          { name: 'Join now!', value: `[Join Voice Channel](${voiceChannel.url})` },
          { name: 'Organizer', value: schedule.schedulingUserTag },
          { name: 'Who sent this ping?', value: message.author.tag },
        ]);

      // Send the reminder to the channel the event was originally scheduled in
      message.guild.channels.resolve(schedule.channelId).send({
        content: `Attention RSVPs: ${attendeeString}`,
        embeds: [embed]
      });
      return message.channel.send('Reminder sent. Remember, with great power comes great responsibility.');

    // Player has indicated they are ready to begin
    case '.ready':
      await dbExecute('UPDATE room_system_ready_checks SET readyState=1 WHERE id=?', [roomSystem.checkId]);
      const pendingCount = await dbQueryAll('SELECT 1 FROM room_system_ready_checks WHERE gameId=? AND readyState=0',
        [roomSystem.gameId]);
      return pendingCount.length === 0 ? message.channel.send('🏁 All players are ready!') : null;

    // Player has indicated they are no longer ready to begin
    case '.unready':
      return dbExecute('UPDATE room_system_ready_checks SET readyState=0 WHERE id=?', [roomSystem.checkId]);

    // Print a list of players who are and are not ready
    case '.readycheck':
      const ready = [];
      const notReady = [];

      // Find each player's ready state
      sql = 'SELECT playerTag, readyState FROM room_system_ready_checks WHERE gameId=?';
      const players = await dbQueryAll(sql, [roomSystem.gameId]);
      players.forEach((player) => {
        if (parseInt(player.readyState, 10) === 1) {
          ready.push(player.playerTag);
        } else {
          notReady.push(player.playerTag);
        }
      });

      const output = ['**Ready:**'];
      ready.length === 0 ?
        output.push('🏜 No players are ready yet.') :
        ready.forEach((player) => output.push(player));

      output.push('');// Add a blank line between ready and not-ready players

      output.push('**Not ready:**');
      notReady.length === 0 ?
        output.push('🏁 All players are ready!') :
        notReady.forEach((player) => output.push(player));

      return message.channel.send(output.join('\n'));

    // Lock a dynamic voice channel, preventing anyone except moderators from joining
    case '.lock':
      return voiceChannel.edit({
        permissionOverwrites: [
          {
            // @everyone may not join the voice channel
            id: message.guild.id,
            deny: [ PermissionsBitField.Flags.Connect ],
          },
          {
            // Moderators should still have full access
            id: (await getModeratorRole(message.guild)).id,
            allow: [ PermissionsBitField.Flags.Connect ],
          },
          {
            // @AginahBot should be able to connect
            id: client.user.id,
            allow: [ PermissionsBitField.Flags.Connect ],
          }
        ]
      });

    // Reopen a dynamic voice channel, allowing anyone to join
    case '.unlock':
      return voiceChannel.edit({ permissionOverwrites: [], });

    case '.close':
      if (!command[1]) { return message.channel.send('You must provide a room code to close the channel.'); }

      // Do not re-close an already closed channel
      if (voiceChannel.name.search(/ \(Closed\)$/g) > -1) { return; }

      // Fetch information about this specific event
      sql = `SELECT se.channelId
         FROM scheduled_events se
         JOIN guild_data gd ON se.guildDataId = gd.id
         WHERE gd.guildId=?
            AND se.eventCode=?
         ORDER BY timestamp DESC
         LIMIT 1`;
      const eventData = await dbQueryOne(sql, [message.guild.id, command[1].toUpperCase()]);

      message.guild.channels.resolve(eventData.channelId)
        .send(`${message.channel.name.replace(/\b\w/g, c => c.toUpperCase())} is now closed.`);
      return voiceChannel.edit({ name: `${voiceChannel.name.toString()} (Closed)` });
  }
};