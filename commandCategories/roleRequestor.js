const config = require('../config.json');

module.exports = {
    category: 'Role Requestor',
    commands: [
        {
            name: 'init-role-system',
            description: 'Create a #role-request channel for users to interact with AginahBot and request roles.',
            longDescription: 'Create a #role-request text channel for users to interact with AginahBot and request ' +
                'roles. This channel will be used to post role category messages users can react to to add or ' +
                'remove roles.',
            aliases: ['irs'],
            usage: '`!aginah init-role-system`',
            minimumRole: null,
            adminOnly: true,
            guildOnly: true,
            execute(message, args) {}
        },
        {
            name: 'destroy-role-system',
            description: 'Delete the role-request channel and all categories and permissions created by this bot.',
            longDescription: null,
            aliases: ['drs'],
            usage: '`!aginah destroy-role-system`',
            minimumRole: null,
            adminOnly: true,
            guildOnly: true,
            execute(message, args) {}
        },
        {
            name: 'create-role-category',
            description: 'Create a category for roles to be added to.',
            longDescription: `Create a category for roles to be added to. Each category will have its own message ` +
                `in the #role-request channel. Category names must be a single alphanumeric word.`,
            aliases: [],
            usage: '`!aginah create-role-category [CategoryName]`',
            minimumRole: config.moderatorRole,
            adminOnly: false,
            guildOnly: true,
            execute(message, args) {}
        },
        {
            name: 'delete-role-category',
            description: 'Delete a role category.',
            longDescription: 'Delete a role category. All roles within this caregory will also be deleted.',
            aliases: [],
            usage: '`!aginah delete-role-category [CategoryName]`',
            minimumRole: config.moderatorRole,
            adminOnly: false,
            guildOnly: true,
            execute(message, args) {}
        },
        {
            name: 'create-role',
            description: 'Create a pingable role.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah cmd create-role [CategoryName] [RoleName] [Reaction] [Description]`',
            minimumRole: config.moderatorRole,
            adminOnly: false,
            guildOnly: true,
            execute(message, args) {}
        },
        {
            name: 'modify-role-reaction',
            description: 'Alter the reaction associated with a role created by this bot.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah modify-role-reaction [CategoryName] [RoleName] [Reaction]`',
            minimumRole: config.moderatorRole,
            adminOnly: false,
            guildOnly: true,
            execute(message, args) {}
        },
        {
            name: 'modify-role-description',
            description: 'Alter the description associated with a role created by this bot.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah modify-role-description`',
            minimumRole: config.moderatorRole,
            adminOnly: false,
            guildOnly: true,
            execute(message, args) {}
        },
        {
            name: 'delete-role',
            description: 'Delete a role created by this bot.',
            longDescription: null,
            aliases: [],
            usage: '`!aginah delete-role [CategoryName] [RoleName]`',
            minimumRole: config.moderatorRole,
            adminOnly: false,
            guildOnly: true,
            execute(message, args) {}
        },
    ],
};