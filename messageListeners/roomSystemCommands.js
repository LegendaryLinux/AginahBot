const ArchipelagoInterface = require('../Archipelago/ArchipelagoInterface');
const { getModeratorRole, dbQueryOne, dbQueryAll, dbExecute, parseArgs } = require('../lib');

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
               AND gd.guildId=?`
  const roomSystem = await dbQueryOne(sql, [message.author.id, message.channel.id, message.guild.id]);
  if (!roomSystem) { return; }

  switch(command[0]) {
    // Player wants to alert players a game is about to start
    case '.ping':
      if (!command[1]) { return message.channel.send('You must provide a room code to ping players.'); }

      sql = `SELECT ea.userId
             FROM scheduled_events se
             JOIN event_attendees ea ON se.id = ea.eventId
             JOIN guild_data gd ON se.guildDataId = gd.id
             WHERE se.eventCode=?
               AND gd.guildId=?
               AND se.timestamp > ((UNIX_TIMESTAMP()*1000) - (30*60*1000))`;
      const attendees = await dbQueryAll(sql, [command[1].toUpperCase(), message.guild.id]);
      if (attendees.length === 0) {
        return message.channel.send("Either there is no recent or upcoming game with that code, or nobody has RSVPed.");
      }

      // Fetch member details, in case they aren't cached
      await message.guild.members.fetch({ user: attendees.map((a) => a.userId) });

      // Build the reminder message
      let reminderMessage = `**${message.author.tag}** would like to remind the following people a game they ` +
        `have RSVPed for is about to start in ${message.channel}:\n`;
      attendees.forEach((attendee) => {
        reminderMessage += `> ${message.guild.members.resolve(attendee.userId).user}\n`;
      });

      // Fetch information about this specific event
      sql = `SELECT se.channelId
         FROM scheduled_events se
         JOIN guild_data gd ON se.guildDataId = gd.id
         WHERE gd.guildId=?
            AND se.eventCode=?
         ORDER BY timestamp DESC
         LIMIT 1`;
      const eventInfo = await dbQueryOne(sql, [message.guild.id, command[1].toUpperCase()]);

      // Send the reminder to the channel the event was originally scheduled in
      message.guild.channels.resolve(eventInfo.channelId).send(reminderMessage);
      return message.channel.send('Reminder sent. Remember, with great power comes great responsibility.');

    // Player has indicated they are ready to begin
    case '.ready':
      await dbExecute(`UPDATE room_system_ready_checks SET readyState=1 WHERE id=?`, [roomSystem.checkId]);
      const pendingCount = await dbQueryAll(`SELECT 1 FROM room_system_ready_checks WHERE gameId=? AND readyState=0`,
        [roomSystem.gameId]);
      return pendingCount.length === 0 ? message.channel.send('🏁 All players are ready!') : null

    // Player has indicated they are no longer ready to begin
    case '.unready':
      return dbExecute(`UPDATE room_system_ready_checks SET readyState=0 WHERE id=?`, [roomSystem.checkId]);

    // Print a list of players who are and are not ready
    case '.readycheck':
      const ready = [];
      const notReady = [];

      // Find each player's ready state
      sql = `SELECT playerTag, readyState FROM room_system_ready_checks WHERE gameId=?`;
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

      output.push('**Not ready:**')
      notReady.length === 0 ?
        output.push('🏁 All players are ready!') :
        notReady.forEach((player) => output.push(player));

      return message.channel.send(output.join('\n'));

    // Lock a dynamic voice channel, preventing anyone except moderators from joining
    case '.lock':
      return await message.guild.channels.resolve(roomSystem.voiceChannelId).edit({
        permissionOverwrites: [
          {
            // @everyone may not join the voice channel
            id: message.guild.id,
            deny: [ 'CONNECT' ],
          },
          {
            // Moderators should still have full access
            id: (await getModeratorRole(message.guild)).id,
            allow: [ 'CONNECT' ],
          },
          {
            // @AginahBot should be able to connect
            id: client.user.id,
            allow: [ 'CONNECT' ],
          }
        ]
      });

    // Reopen a dynamic voice channel, allowing anyone to join
    case '.unlock':
      return await message.guild.channels.resolve(roomSystem.voiceChannelId).edit({
        permissionOverwrites: [],
      });

    case '.close':
      if (!command[1]) { return message.channel.send('You must provide a room code to close the channel.'); }

      let voiceChannel = message.guild.channels.resolve(roomSystem.voiceChannelId);

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

    // TODO: Move this out of room system commands and into a command category
    case '.connect':
      if (command.length < 3) {
        return message.channel.send('Invalid arguments passed. Syntax:' +
          '```.connect server:port gameName slotName [password]```');
      }

      const APInterface = new ArchipelagoInterface(message.channel, command[1], command[2], command[3]);
      message.client.tempData.apInterfaces.set(message.channel.id, APInterface);

      // Automatically disconnect and destroy this interface after six hours
      setTimeout(() => {
        if (message.channel.template.apInterfaces.has(message.channel.id)) {
          message.client.tempData.apInterfaces.get(message.channel.id).disconnect();
          message.client.tempData.apInterfaces.delete(message.channel.id);
        }
      }, 21600000);

    // TODO: Add a case allowing a user to associate with an alias, if an APInterface exists for the channel
  }
};