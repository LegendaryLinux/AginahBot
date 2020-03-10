# AginahBot
A Discord bot designed to help organize, host, and moderate Z3R Multiworld Tournaments.

## Current Features
- Automatic creation of race voice and text channels, and automatic assignment of permissions to prevent viewing
    an opposing team's chat
- Support casual multiworld voice and text channels, and automatic assignment of permissions on those channels
- Host a [Berserker-style](https://github.com/Berserker66/MultiWorld-Utilities) multiworld game given 
    a `.multidata` file
- Support sending commands to the server via the bot

## Configuration
A `.env` file is required to be present in the base directory of the repository. This file should contain
your Discord bot's secret key and a name for the SQLite database file.

Example config:
```.env
AGINAHBOT_TOKEN=somereallylongsecretkeyprovidedbydiscord
SQLITE_DB_NAME="aginahbot.db.sqlite3"
BERSERKER_PATH=/path/to/berserker/MultiServer.py
```

If you intend to create your own bot on Discord using the code in this repository, your bot will need
the following permissions:
- Manage Roles
- Manage Channels
- Read Text Channels & See Voice Channels
- Send Messages
- Manage Messages
- Move Members