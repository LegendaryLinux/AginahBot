# AginahBot
A Discord bot designed to help organize and moderate Multiplayer-Capable Randomizer games.  
Find it in use at the [Archipelago Discord](https://discord.gg/B5pjMYy).

[Click here to learn how to add AginahBot to your Discord server!](https://github.com/LegendaryLinux/AginahBot/wiki/Using-AginahBot-on-Your-Discord-Server)

## Current Features
- Support dynamic voice and text channels, and automatic assignment of permissions on those channels
- Ready check system for users in dynamic game channels
- Privacy controls for users in dynamic game channels
- Automatically delete ROM files, and compressed files containing them
- Organization features to help schedule games
- Alert players in game lobbies that their seeds are ready
- Custom role system to allow users to assign themselves pingable roles to be alerted of games
- Generate single-player or multiplayer games using the `generate` command

## Supported Games
The following games are supported through the
[Archipelago Randomizer](https://github.com/Berserker66/MultiWorld-Utilities),
and have full MultiWorld compatibility with each other.
- The Legend of Zelda: A Link to the Past

# Self-Hosting

## Prerequisites
- `node` and `npm` should be installed to run the bot and install dependencies
- `unrar` should be installed on your system to process `.rar` files.
- A MySQL 8 server should be installed, and a database available.

## Configuration
A `config.json` file is required to be present in the base directory of the repository. This file should contain
your Discord bot's secret key, database information, a command prefix, and a name for the Moderator role which
will be created on servers the bot joins if it does not exist already. 

Example config:
```json
{
  "token": "discord-bot-token",
  "dbHost": "hostname-of-mysql-server",
  "dbUser": "database-username",
  "dbPass": "database-password",
  "dbName": "database-name",
  "commandPrefix": "!aginah ",
  "moderatorRole": "Moderator"
}
```

If you intend to create your own bot on Discord using the code in this repository, your bot will need
permissions granted by the permissions integer `285273168`.

The following permissions will be granted
to AginahBot:
- Manage Roles
- Manage Channels
- Read Text Channels & See Voice Channels
- Send Messages
- Manage Messages
- Embed Links
- Attach Files
- Add Reactions
- Move Members (Voice Channels)

## Setup
```shell script
# Clone the repo
git clone https://github.com/LegendaryLinux/AginahBot

# Enter its directory
cd AginahBot

# Install required packages
npm install

# Set up your config.json file
vim config.json

# Initialize the database
node dbSetup.js

# Run the bot
node bot.js
```

Note that `dbSetup.js` requires a database user with the `CREATE TABLE` permission, but normal operation requires
only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on your target database. It is recommended to use an administrative
user to configure the database, and a non-admin user with restricted permissions during normal operation.
