const { getModeratorRole, dbQueryOne, dbQueryAll, dbExecute } = require('../lib');

module.exports = async (client, message) => {
  if (!message.guild) { return; }

  const command = message.content.trim().split(/ +/);
  const dotCommands = ['.ping', '.ready', '.unready', '.readycheck', '.close', '.lock', '.unlock'];
  if (!command[0] || dotCommands.indexOf(command[0]) === -1) { return; }

  let sql = `SELECT rsrc.id AS checkId, rsg.id AS gameId, rsg.voiceChannelId, rs.planningChannelId
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

      let reminderMessage = `**${message.author.tag}** would like to remind the following people a game they ` +
        `have RSVPed for is about to start in ${message.channel}:\n`;
      attendees.forEach((attendee) => {
        reminderMessage += `> ${message.guild.members.resolve(attendee.userId).user}\n`;
      });

      message.guild.channels.resolve(roomSystem.planningChannelId).send(reminderMessage);
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
      let voiceChannel = message.guild.channels.resolve(roomSystem.voiceChannelId);
      // Do not re-close an already closed channel
      if (voiceChannel.name.search(/ \(Closed\)$/g) > -1) { return; }
      message.guild.channels.resolve(roomSystem.planningChannelId)
        .send(`${message.channel.name.replace(/\b\w/g, c => c.toUpperCase())} is now closed.`);
      return voiceChannel.edit({ name: `${voiceChannel.name.toString()} (Closed)` });
  }
};