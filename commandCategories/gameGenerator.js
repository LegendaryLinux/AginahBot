const axios = require('axios');
const request = require('request');
const FormData = require('form-data');
const jsYaml = require('js-yaml');
const tmp = require('tmp');
const fs = require('fs');
const { supportedGames } = require('../assets/supportedGames.json');
const { presets } = require('../assets/presets.json');

const API_ENDPOINT = 'https://archipelago.gg/api/generate';
const SEED_DOWNLOAD_URL = 'archipelago.gg/hosted';

module.exports = {
    category: 'Game Generator',
    commands: [
        {
            name: 'generate',
            description: 'Generate a game based on a preset or uploaded file.',
            longDescription: null,
            aliases: ['gen'],
            usage: '`!aginah generate configFile [race]` or `!aginah generate game preset [race]`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                // Handle requests to generate a game from a file
                if (message.attachments.size > 0){
                    // If the word "race" is provided as an argument anywhere, treat this as a race seed
                    let race = '0';
                    args.forEach((arg) => {
                        if (arg.toLowerCase() === 'race') { race = '1'; }
                    });

                    const postfix = '.'+message.attachments.first().name.split('.').reverse()[0];
                    const tempFile = tmp.fileSync({ prefix: "upload-", postfix });
                    return request.get(message.attachments.first().url)
                        .pipe(fs.createWriteStream(tempFile.name))
                        .on('close', () => {
                            // Send request to api
                            const formData = new FormData();
                            formData.append('file', fs.createReadStream(tempFile.name), tempFile.name);
                            formData.append('race', race);
                            const axiosOpts = { headers: formData.getHeaders() };
                            axios.post(API_ENDPOINT, formData, axiosOpts)
                                .then((bResponse) => { // Berserker Response
                                    message.channel.send(`Seed generation underway. When it's ready, you will be ` +
                                        `able to download your patch file from:\n${bResponse.data.url}`);
                                    tempFile.removeCallback();
                                }).catch((error) => {
                                    message.channel.send("I couldn't generate that game, sorry.");
                                    if(error.isAxiosError && error.response.data){
                                        console.error(`Unable to generate game on ${API_ENDPOINT}. The following ` +
                                            `data was returned from the endpoint:`);
                                        return console.error(error.response.data);
                                    }

                                    return console.error(error);
                                });
                        });
                }

                if (args.length < 2) {
                    return message.channel.send('You must specify a game and preset to generate from. See ' +
                      '`!aginah games` and `!aginah presets` for more information.');
                }

                // A game must be specified
                if (!supportedGames.hasOwnProperty(args[0].toLowerCase())) {
                    return message.channel.send('I don\'t recognize that game. See `!aginah games` for a list ' +
                      'of supported games.');
                }

                // Game must exist in presets object
                if (args[0] && !presets.hasOwnProperty(args[0].toLowerCase())) {
                    return message.channel.send("Presets are not currently supported for that game.");
                }

                // Presets must exist in presets.game object
                if (!presets[args[0].toLowerCase()].hasOwnProperty(args[1].toLowerCase())) {
                    return message.channel.send("That preset doesn't exist for the requested game.");
                }

                // Argument validation. Similar to the above validation, but the argument positions are increased
                // by one. Arguments 2 and 3 can be provided in any order, or not at all.
                // Here, they are parsed if present and their meanings interpreted. The word "race" indicates
                // a race request while a number indicates a player count.
                let race = '0';
                args.forEach((arg) => {
                    if (arg.toLowerCase() === 'race') { race = '1'; }
                });

                return axios.post(supportedGames[args[0].toLowerCase()].apiEndpoint, {
                    // Eventually, get rid of the weights key and use presetData only
                    weights: { [args[1].toLowerCase()]: presets[args[0].toLowerCase()][args[1].toLowerCase()] },
                    presetData: { [args[1].toLowerCase()]: presets[args[0].toLowerCase()][args[1].toLowerCase()] },
                    race,
                }).then((bResponse) => {
                    message.channel.send(`Seed generation underway. When it's ready, you will be able to ` +
                        `download your patch file from:\n${bResponse.data.url}`);
                }).catch((error) => {
                    message.channel.send("I couldn't generate that game, sorry.");
                    if(error.isAxiosError && error.response.data){
                        console.error(`Unable to generate game. The following data was returned from the endpoint:`);
                        return console.error(error.response.data);
                    }

                    return console.error(error);
                });
            }
        },
        {
            name: 'presets',
            description: 'Get a list of presets or download a preset file.',
            longDescription: null,
            aliases: ['preset'],
            usage: '`!aginah presets game [preset]`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (args.length === 0) {
                    return message.channel.send("You must specify a game to list presets for. Use " +
                        "`!aginah games` to get a list of supported games.");
                }

                if (!presets.hasOwnProperty(args[0].toLowerCase())) {
                    return message.channel.send("Presets have not been configured for that game.");
                }

                if (args.length === 1) {
                    if (Object.keys(presets[args[0].toLowerCase()]).length === 0) {
                        return message.channel.send('No presets are available for that game.');
                    }
                    const response = ['The following presets are available:'];
                    Object.keys(presets[args[0].toLowerCase()]).forEach((preset) => response.push(`\n - ${preset}`));
                    return message.channel.send(response.join(''));
                }

                if (!presets[args[0].toLowerCase()].hasOwnProperty(args[1].toLowerCase())) {
                    return message.channel.send("I don't know that preset. Use `!aginah game presets` to get a list " +
                        "of available presets.");
                }

                const preferYaml = supportedGames[args[0].toLowerCase()].preferYaml;
                let presetData = null;
                if (preferYaml){
                    const yamlOpts = { noCompatMode: true };
                    presetData = jsYaml.safeDump(presets[args[0].toLowerCase()][args[1].toLowerCase()], yamlOpts)
                        .replace(/'(\d+)':/g, (x, y) => `${y}:`);
                } else {
                    presetData = JSON.stringify(presets[args[0].toLowerCase()][args[1].toLowerCase()]);
                }

                return tmp.file((err, tmpFilePath, fd, cleanupCallback) => {
                    fs.writeFile(tmpFilePath, presetData, () => {
                        return message.channel.send({
                            files: [
                                {
                                    name: args[1].toLowerCase()+(preferYaml ? '.yaml' : '.json'),
                                    attachment: tmpFilePath,
                                }
                            ],
                        }).then(() => cleanupCallback);
                    });
                });
            }
        },
        {
            name: 'games',
            description: 'Get a list of games AginahBot can generate seeds for.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah games`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message) {
                const data = ['The currently supported games are:'];
                Object.keys(supportedGames).forEach((game) => {
                    data.push(`\n - ${supportedGames[game].friendlyName} (**${game}**)`);
                });
                return message.channel.send({ content: data.join('') });
            }
        }
    ],
};