# AginahBot
A Discord bot designed to help organize and moderate Multiplayer-Capable Randomizer games.  
Find it in use at the [MultiWorld Discord](https://discord.gg/B5pjMYy).

[Click here to learn how to add AginahBot to your Discord server!](https://github.com/LegendaryLinux/AginahBot/wiki/Using-AginahBot-on-Your-Discord-Server)

## Current Features
- Support dynamic voice and text channels, and automatic assignment of permissions on those channels
- Automatically delete ROM files, and compressed files containing them
- Organization features to help schedule games
- Alert players in game lobbies that their seeds are ready
- Custom role system to allow users to assign themselves pingable roles to be alerted of games
- Generate single-player or multiplayer games using the `generate` command

## Supported Games
- The Legend of Zelda: A Link to the Past

# Self-Hosting

## Prerequisites
- `unrar` should be installed on your system to process `.rar` files.

## Configuration
A `config.json` file is required to be present in the base directory of the repository. This file should contain
your Discord bot's secret key, a name for the SQLite database file, a command prefix, a name for the text channel
used in the role requestor system, and a name for the Moderator role which will be created on servers the bot
joins if it does not exist already. 

Example config:
```json
{
  "token": "your-token-here",
  "dbFile": "aginahBot.db.sqlite3",
  "commandPrefix": "!aginah ",
  "moderatorRole": "Moderator"
}
```

If you intend to create your own bot on Discord using the code in this repository, your bot will need
permissions granted by the permissions integer `285240400`.

The following permissions will be granted
to AginahBot:
- Manage Roles
- Manage Channels
- Read Text Channels & See Voice Channels
- Send Messages
- Manage Messages
- Embed Links
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

# Run the bot
node bot.js
```
