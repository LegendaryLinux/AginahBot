module.exports = (client, messageReaction, user) => {
    console.log(`${user.tag} interacted with a reaction on message with id ${messageReaction.message.id}.`);
};