# AginahBot
A Discord bot designed to make your life as a community manager easier.  
Find it in use at the [Archipelago Discord](https://discord.gg/B5pjMYy).

[Click here to learn how to add AginahBot to your Discord server!](https://github.com/LegendaryLinux/AginahBot/wiki/Using-AginahBot-on-Your-Discord-Server)

## Current Features
- Support dynamic voice and text channels, and automatic assignment of permissions on those channels
- Custom role system to allow users to assign themselves roles
- A mod-contact feature, which allows users to privately contact your moderation team
- Event scheduling features for those times when the server-wide event system would not be appropriate
- Ready check system for users in dynamic game channels
- Privacy controls for users in dynamic game channels

# Self-Hosting

## Prerequisites
- `node` and `npm` should be installed to run the bot and install dependencies
- A MySQL 8 server should be installed, and a database available.

## Configuration
A `config.json` file is required to be present in the base directory of the repository. This file should contain
your Discord bot's secret key, client id, database information, and a name for the Moderator role which
will be created on servers the bot joins if it does not exist already. 

Example config:
```json
{
  "token": "discord-bot-token",
  "clientId": "application-client-id",
  "dbHost": "hostname-of-mysql-server",
  "dbUser": "database-username",
  "dbPass": "database-password",
  "dbName": "database-name",
  "moderatorRole": "Moderator",
  "googleApiClientEmail": "foo@bar.com",
  "googleApiPrivateKey": "google-api-private-key"
}
```

If you intend to create your own bot on Discord using the code in this repository, your bot will need
permissions granted by the permissions integer `293416987728`.

The following permissions will be granted
to AginahBot:
- View Channels
- Manage Channels
- Manage Roles
- Manage Emojis and Stickers
- Send Messages
- Send Messages in Threads
- Embed Links
- Attach Files
- Add Reactions
- Mention @everyone, @here, and All Roles
- Manage Messages
- Manage Threads
- Read Message History
- Move Members

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
