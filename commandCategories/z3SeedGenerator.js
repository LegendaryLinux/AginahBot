const axios = require('axios');
const jsYaml = require('js-yaml');
const tmp = require('tmp');
const fs = require('fs');
const { generalErrorHandler } = require('../errorHandlers');
const { presets } = require('../assets/presets.json');

// TODO: Get the final endpoint URL
const GENERATOR_ENDPOINT = 'https://berserkermulti.world/generate';

module.exports = {
    category: 'Z3 Seed Generator',
    commands: [
        {
            name: 'generate',
            description: 'Generate a single-player game based on a preset or uploaded file.',
            longDescription: null,
            aliases: ['gen'],
            usage: '`!aginah generate preset`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (message.attachments.array().length > 0){
                    // TODO: Download attachment and forward it to BMW 🏎
                }

                if (presets.hasOwnProperty(args[0].toLowerCase())){
                    return axios.post(GENERATOR_ENDPOINT, {}).then((response) => {
                        // TODO: Get the final endpoint data
                        message.channel.send('Game generated. Grab your patch file at: ' +
                            '\nhttps://berserkermulti.world/hosted');
                    }).catch((error) => {
                        message.channel.send("I couldn't generate that game, sorry.");
                        generalErrorHandler(error);
                    });
                }

                return message.channel.send("When do you want me to generate? `!aginah help generate` for more info.");
            }
        },
        {
            name: 'presets',
            description: 'Get a list of presets or download a preset file.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah presets [preset]`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    const response = ['The following presets are available:'];
                    Object.keys(presets).forEach((preset) => response.push(preset));
                    return message.channel.send(response);
                }

                if (!presets.hasOwnProperty(args[0].toLowerCase())) {
                    return message.channel.send("I don't know that preset. Use `!aginah presets` to get a list " +
                        "of presets you can use.");
                }

                const yaml = jsYaml.safeDump(presets[args[0].toLowerCase()], { noCompatMode: true })
                    .replace(/'(\d+)':/g, (x, y) => `${y}:`);

                tmp.file((err, tmpFilePath, fd, cleanupCallback) => {
                    fs.writeFile(tmpFilePath, yaml, () => {
                        return message.channel.send({
                            files: [
                                {
                                    name: args[0].toLowerCase()+'.yaml',
                                    attachment: tmpFilePath,
                                }
                            ],
                        }).then(() => cleanupCallback);
                    });
                });
            }
        }
    ],
};