# AginahBot
A Discord bot designed to help organize, host, and moderate Z3R Multiworld Tournaments.

## Current Features

- Automatic creation of race voice and text channels, and automatic assignment of permissions to prevent viewing
    an opposing team's chat

## Planned Features

- Host a [Berserker-style](https://github.com/Berserker66/MultiWorld-Utilities) multiworld game given 
    a `.multidata` file
- Optionally provide a zipped file containing `host.yaml`, `meta.yaml`, and `player.yaml` files to host
    a more customized game
- Support sending commands to the server via the bot
- Support a server commands blacklist  

## Configuration
A `.env` file is required to be present in the base directory of the repository. This file should contain
your Discord bot's secret key and a name for the SQLite database file.

Example config:
```.env
AGINAHBOT_TOKEN=somereallylongsecretkeyprovidedbydiscord
SQLITE_DB_NAME="aginahbot.db.sqlite3"
```

If you intend to create your own bot on Discord using the code in this repository, your bot will need
the following permissions:
- Manage Roles
- Manage Channels
- Read Text Channels & See Voice Channels
- Send Messages
- Manage Messages
- Embed Links
- Attach Files
- Read Message History
- Use External Emojis
- Add Reactions
- Move Members