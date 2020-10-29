const axios = require('axios');
const FormData = require('form-data');
const jsYaml = require('js-yaml');
const tmp = require('tmp');
const fs = require('fs');
const { presets } = require('../assets/presets.json');

const API_ENDPOINT = 'https://berserkermulti.world/api/generate';
const Z3_DOMAIN = 'https://berserkermulti.world'

module.exports = {
    category: 'Z3 Seed Generator',
    commands: [
        {
            name: 'generate',
            description: 'Generate a game based on a preset or uploaded file.',
            longDescription: null,
            aliases: ['gen'],
            usage: '`!aginah generate preset|yamlFile|zipFile [race]`',
            guildOnly: false,
            minimumRole: null,
            adminOnly: false,
            execute(message, args) {
                if (message.attachments.array().length > 0){
                    return axios.get(message.attachments.array()[0].url).then((dResponse) => { // Discord Response
                        const postfix = '.'+message.attachments.array()[0].name.split('.').reverse()[0];
                        return tmp.file({postfix}, (err, tmpFilePath, fd, cleanupCallback) => {
                            fs.writeFile(tmpFilePath, dResponse.data, () => {
                                const formData = new FormData();
                                formData.append('file', fs.createReadStream(tmpFilePath));
                                formData.append('race', (args[0] && args[0].toLowerCase() === 'race') ? '1' : '0');
                                axios.post(API_ENDPOINT, formData, { headers: formData.getHeaders() }).then((bResponse) => { // Berserker Response
                                    message.channel.send(`Game generated. Download your patch file from:\n` +
                                        `${Z3_DOMAIN}${bResponse.data.url}`);
                                    cleanupCallback();
                                }).catch((error) => {
                                    message.channel.send("I couldn't generate that game, sorry.");
                                    return console.error(error);
                                });
                            });
                        });
                    });
                }

                if (args[0] && presets.hasOwnProperty(args[0].toLowerCase())){
                    return axios.post(API_ENDPOINT, {
                        weights: { [args[0].toLowerCase()]: presets[args[0].toLowerCase()] },
                        race: false,
                    }).then((bResponse) => {
                        message.channel.send(`Seed generation underway. When it's ready, you will be able to ` +
                            `download your patch file from:\n${Z3_DOMAIN}${bResponse.data.url}`);
                    }).catch((error) => {
                        message.channel.send("I couldn't generate that game, sorry.");
                        return console.error(error);
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

                return tmp.file((err, tmpFilePath, fd, cleanupCallback) => {
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