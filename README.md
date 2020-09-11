# AginahBot
A Discord bot designed to help organize and moderate Z3R Multiworld Games.  
Find it in use at [Berserker's MultiWorld Discord](https://discord.gg/B5pjMYy)

## Current Features
- Automatic creation of race voice and text channels, and automatic assignment of permissions to prevent viewing
    an opposing team's chat
- Support casual multiworld voice and text channels, and automatic assignment of permissions on those channels
- Automatically delete ROM files, and compressed files containing them
- Organization features to help schedule games
- Alert players in game lobbies that their seeds are ready

## Configuration
A `.env` file is required to be present in the base directory of the repository. This file should contain
at minimum your Discord bot's secret key, and a name for the SQLite database file. A couple notes about
the `.env` file:
- The discord bot token is required
- The sqlite database name is required

Example config:
```.env
AGINAHBOT_TOKEN=somereallylongsecretkeyprovidedbydiscord
SQLITE_DB_NAME="aginahbot.db.sqlite3"
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
