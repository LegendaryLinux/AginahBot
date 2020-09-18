module.exports = (client, messageReaction, user) => {
    if (user.bot) { return; }
    console.log(`${user.tag} removed a reaction on message with id ${messageReaction.message.id}.`);
};