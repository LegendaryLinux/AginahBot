module.exports = (client, messageReaction, user, added=true) => {
    if (user.bot || !added) { return; }
    console.log(`${user.tag} added a reaction on message with id ${messageReaction.message.id}.`);
};