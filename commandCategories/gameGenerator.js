const axios = require('axios');
const request = require('request');
const FormData = require('form-data');
const tmp = require('tmp');
const fs = require('fs');

const API_ENDPOINT = 'https://archipelago.gg/api/generate';

module.exports = {
  category: 'Game Generator',
  commands: [
    {
      name: 'generate',
      description: 'Generate a game based on an uploaded file.',
      longDescription: null,
      aliases: ['gen'],
      usage: '`!aginah generate configFile [race|tournament]`',
      guildOnly: false,
      moderatorRequired: false,
      adminOnly: false,
      execute(message, args) {
        if (message.attachments.size === 0) {
          return message.channel.send('You must upload a zip or yaml file to generate a game.');
        }

        // Handle requests to generate a game from a file
        // If the word "race" is provided as an argument anywhere, treat this as a race seed
        let race = '0';
        let hintCost = '10';
        let forfeitMode = 'auto';
        let remainingMode = 'disabled';
        let collectMode = 'goal';
        args.forEach((arg) => {
          if (arg.toLowerCase() === 'race') {
            race = '1';
            hintCost = '10';
            forfeitMode = 'auto';
            remainingMode = 'disabled';
            collectMode = 'disabled';
          }
          if (arg.toLowerCase() === 'tournament') {
            race = '1';
            hintCost = '101';
            forfeitMode = 'disabled';
            remainingMode = 'disabled';
            collectMode = 'disabled';
          }
        });

        const postfix = '.'+message.attachments.first().name.split('.').reverse()[0];
        const tempFile = tmp.fileSync({ prefix: 'upload-', postfix });
        return request.get(message.attachments.first().url)
          .pipe(fs.createWriteStream(tempFile.name))
          .on('close', () => {
            // Send request to api
            const formData = new FormData();
            formData.append('file', fs.createReadStream(tempFile.name), tempFile.name);
            formData.append('hint_cost', hintCost);
            formData.append('forfeit_mode', forfeitMode);
            formData.append('remaining_mode', remainingMode);
            formData.append('collect_mode', collectMode);
            formData.append('race', race);
            const axiosOpts = { headers: formData.getHeaders() };
            axios.post(API_ENDPOINT, formData, axiosOpts)
              .then((apResponse) => {
                message.channel.send('Seed generation underway. When it\'s ready, you will be ' +
                                    `able to download your patch file from:\n${apResponse.data.url}`);
                tempFile.removeCallback();
              }).catch((error) => {
                message.channel.send('I couldn\'t generate that game, sorry.');
                if(error.isAxiosError && error.response.data){
                  console.error(`Unable to generate game on ${API_ENDPOINT}. The following ` +
                                      'data was returned from the endpoint:');
                  return console.error(error.response.data);
                }

                return console.error(error);
              });
          });
      }
    },
  ],
};