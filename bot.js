const Discord = require('discord.js')
const config = require('./config.json');
const errorHandlers = require('./errorHandlers');
const { verifyUserPermissions } = require('./lib');
const fs = require('fs');

const client = new Discord.Client();
client.once('ready', () => {
    console.log("Connected to Discord. Active in X guilds.");
});

client.commands = new Discord.Collection();
fs.readdirSync('./commands').filter((file) => file.endsWith('.js')).forEach((commandFile) => {
    const command = require(`./commands/${commandFile}`);
    client.commands.set(command.name, command);
});

client.on('message', (message) => {
    // Message must begin with a command prefix and must also not be initiated by a bot
    if (!message.content.startsWith(config.commandPrefix) || message.author.bot) { return; }

    // Parse command and arguments
    const args = message.content.slice(config.commandPrefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    try{
        // Get the command object
        const command = client.commands.get(commandName) ||
            client.commands.find((cmd) => cmd.aliases && cmd.aliases.includes(commandName));

        // If the command does not exist, alert the user
        if (!command) { return message.channel.send("I don't know that command. `!aginah help` for more info."); }

        // If the command does not require a guild, just run it
        if (!command.guildOnly) { return command.execute(message, args); }

        // If this message was not sent from a guild, deny it
        if (!message.guild) { return message.reply('That command may only be used in a server.'); }

        // If the command is available to everyone, just run it
        if (!command.minimumPermissions) { return command.execute(message, args); }

        // Otherwise, the user must have permission to access this command
        verifyUserPermissions(message.member, command.minimumPermissions).then((permitted) => {
            if (permitted) { return command.execute(message, args); }
            return message.reply('You are not authorized to use that command.');
        }).catch(errorHandlers.generalErrorHandler);
    }catch (error) {
        // Log the error, report a problem
        console.error(error);
        message.reply("Something broke. Maybe check your command?")
    }
});

client.login(config.token);