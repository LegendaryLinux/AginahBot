module.exports = (client, messageReaction, user) => {
    if (user.bot) { return; }
    console.log(`${user.tag} added a reaction on message with id ${messageReaction.message.id}.`);
};