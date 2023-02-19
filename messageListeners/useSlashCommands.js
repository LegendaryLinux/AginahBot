module.exports = async (client, message) => {
  if (message.content.substring(0, 7).toLowerCase() === '!aginah') {
    return message.channel.send({
      content: '`!aginah` commands are no longer supported. Please use slash commands instead.' +
        ' To start, type a `/` in the chat box.'
    });
  }
};