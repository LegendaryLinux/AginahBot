# AginahBot
A Discord bot designed to help organize, host, and moderate Z3R Multiworld Games.

## Current Features
- Automatic creation of race voice and text channels, and automatic assignment of permissions to prevent viewing
    an opposing team's chat
- Support casual multiworld voice and text channels, and automatic assignment of permissions on those channels
- Host a [Berserker-style](https://github.com/Berserker66/MultiWorld-Utilities) multiworld game given 
    a `.multidata` file
- Support for hosting and resuming multiworld games
- Support for sending commands to the server via the bot

## Configuration
A `.env` file is required to be present in the base directory of the repository. This file should contain
at minimum your Discord bot's secret key, and a name for the SQLite database file. You may optionally include
a public IP address and a host url. A few notes about the `.env` file:
- The discord bot token is required
- The sqlite database name is required
- If absent, the public ip will be automatically determined
- If present, the host url will be provided to users instead of the public ip

Example config:
```.env
AGINAHBOT_TOKEN=somereallylongsecretkeyprovidedbydiscord
SQLITE_DB_NAME="aginahbot.db.sqlite3"
PUBLIC_IP="127.0.0.1"
HOST_URL="multiworld.link"
```

If you intend to create your own bot on Discord using the code in this repository, your bot will need
permissions granted by the permissions integer `285273104`.

The following permissions will be granted
to AginahBot:
- Manage Roles
- Manage Channels
- Read Text Channels & See Voice Channels
- Send Messages
- Embed Links
- Attach Files
- Manage Messages
- Move Members