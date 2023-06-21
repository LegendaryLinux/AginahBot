module.exports = {
  generalErrorHandler: (error) => {
    console.error(error);
  },

  dmErrorHandler: (error, message) => {
    console.error(`Unable to send a DM to ${message.author.username}.\n`, error);
    message.reply('It seems like I can\'t send you a DM. Do you have them disabled?');
  },
};
