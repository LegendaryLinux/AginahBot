import discord
from discord.ext import commands

ROLE_REQUEST_CHANNEL = 'role-request'
MODERATOR_ROLE = 'Moderator'


async def is_administrator(ctx: commands.Context):
    return ctx.author.guild_permissions.administrator


async def is_moderator(ctx: commands.Context):
    guild_roles = []
    for role in ctx.guild.roles:
        guild_roles.append(role.name)

    moderator_roles = guild_roles[guild_roles.index('Moderator'):]
    return ctx.author.guild_permissions.administrator or (ctx.author.top_role in moderator_roles)


class RoleRequestor(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    async def build_category_message(self, ctx: commands.Context, category: tuple):
        roles = self.bot.dbc.execute("SELECT role, description, reaction FROM roles WHERE categoryId=?",
                                     (category[0],)).fetchall()
        message_lines = [
            f"\n**{category[2]} Roles:**"
        ]

        if len(roles) == 0:
            message_lines.append('\n\nThere are no roles in this category.')
            return ''.join(message_lines)

        for db_role in roles:
            role = discord.utils.get(ctx.guild.roles, name=db_role[0])
            if not role:
                await ctx.send(f"@FarrakKilhn Something weird happened. Role {db_role[0]} should exist, but doesn't.")
                return

            # Append role line to message body
            emoji = db_role[2] if len(db_role[2]) == 1 else f"<{db_role[2]}>"
            description = f": *{db_role[1]}*" if db_role[1] else None
            message_lines.append(f"\n\n{emoji} - {role.mention}{description}")

        message_lines.append("\n\n")
        return ''.join(message_lines)

    async def fetch_role(self, event: discord.RawReactionActionEvent, guild: discord.Guild, member: discord.Member):
        db_role = self.bot.dbc.execute("SELECT role FROM roles r "
                                       "JOIN role_categories rc ON r.categoryId=rc.id "
                                       "WHERE rc.guildId=? "
                                       "   AND rc.messageId=? "
                                       "   AND r.reaction=?",
                                       (event.guild_id, event.message_id, event.emoji.name)).fetchone()
        if not db_role:
            # Alert user that role cannot be added
            await member.send("The role you requested could not be added, sorry.")
            raise Exception(f"Role name could not be found in database based on guild and "
                            f"message id for guild {guild.name} with id {guild.id}")

        role = discord.utils.get(guild.roles, name=db_role[0])
        if not role:
            # Alert user that role cannot be added
            await member.send("The role you requested could not be added, sorry.")
            raise Exception(f"Discord role could not be resolved from role name in guild "
                            f"{guild.name} with id {guild.id}")

        return role

    @commands.command(
        name="init-role-system",
        brief="Create a #role-request channel for users to interact with AginahBot and request roles",
        help="Create a #role-request text channel for users to interact with AginahBot and request roles. "
             "This channel will be used to post role category messages users can react to to add or remove roles\n"
             "Usage: !aginah init-role-system")
    @commands.check(is_administrator)
    async def init_role_system(self, ctx: commands.Context):
        mod_role = discord.utils.get(ctx.guild.roles, name=MODERATOR_ROLE)
        if not mod_role:
            await ctx.send("There is no @Moderator role on your server. Please create one and try again.")
            return

        for channel in ctx.guild.text_channels:
            if channel.name == ROLE_REQUEST_CHANNEL:
                await ctx.send("It looks like the roles system is already active on this server.")
                return

        text_channel = await ctx.guild.create_text_channel(ROLE_REQUEST_CHANNEL,
                                                           topic="Assign yourself roles if you would like to be pinged",
                                                           overwrites={
                                                               ctx.guild.default_role: discord.PermissionOverwrite(
                                                                   add_reactions=False),
                                                               ctx.guild.me: discord.PermissionOverwrite(
                                                                   add_reactions=True)
                                                           })
        await text_channel.send(f"The following roles are available on this server. If you would like to be "
                                f"assigned a role, please react to this message with the indicated emoji. All "
                                f"roles are pingable by everyone on the server. Remember, with great power comes "
                                f"great responsibility.\n")
        await ctx.send("Role system initialized.")

    @commands.command(
        name="destroy-role-system",
        brief="Delete the role-request channel and all categories and permissions created by this bot",
        help="Delete the role-request channel and all categories and permissions created by this bot\n"
             "Usage: !aginah init-role-system")
    @commands.check(is_administrator)
    async def destroy_role_system(self, ctx: commands.Context):
        # Fetch categories for this guild
        categories = self.bot.dbc.execute("SELECT id FROM role_categories WHERE guildId=?", (ctx.guild.id,))
        for category in categories:
            # Fetch roles for this category
            db_roles = self.bot.dbc.execute("SELECT role FROM roles WHERE categoryId=?", (category[0],))
            for db_role in db_roles:
                # Delete role from the guild
                role = discord.utils.get(ctx.guild.roles, name=db_role[0])
                await role.delete()

            # Delete roles from the db
            self.bot.dbc.execute("DELETE FROM roles WHERE categoryId=?", (category[0],))

        # Delete categories from db
        self.bot.dbc.execute("DELETE FROM role_categories WHERE guildId=?", (ctx.guild.id,))
        self.bot.db.commit()

        channel = discord.utils.get(ctx.guild.text_channels, name=ROLE_REQUEST_CHANNEL)
        await channel.delete()

        await ctx.send("Role system destroyed.")

    @commands.command(
        name="create-role-category",
        brief="Create a category for roles to be added to.",
        help="Create a category for roles to be added to. Each category will have its own message in the "
             "#role-request channel. Category names must be a single alphanumeric word.\n"
             "Usage: !aginah create-role-category CategoryName"
    )
    @commands.check(is_moderator)
    async def create_role_category(self, ctx: commands.Context):
        args = ctx.message.content.split(' ')
        if len(args) != 3:
            await ctx.send("Looks like you have a syntax error! `!aginah help create-role-category` for more info.")
            return

        # If category already exists, warn user and do nothing
        if self.bot.dbc.execute("SELECT 1 FROM role_categories WHERE guildId=? AND category=?",
                                (ctx.guild.id, args[2],)).fetchone():
            await ctx.send("That category already exists!")
            return

        # Create the new category and add a message to the #role-request channel
        role_channel = discord.utils.get(ctx.guild.text_channels, name=ROLE_REQUEST_CHANNEL)
        message = await role_channel.send(f"Creating category. Standby...")

        # Save the new category and message id into the database
        self.bot.dbc.execute("INSERT INTO role_categories (guildId, category, messageId) VALUES (?,?,?)",
                             (ctx.guild.id, args[2].strip(), message.id))
        self.bot.db.commit()

        category = self.bot.dbc.execute("SELECT * FROM role_categories WHERE guildId=? AND category=?",
                                        (ctx.guild.id, args[2])).fetchone()

        await message.edit(content=await self.build_category_message(ctx, category))

        await ctx.send("Category created.")

    @commands.command(
        name="delete-role-category",
        brief="Delete a role category.",
        help="Delete a role category. All roles within this category will also be deleted.\n"
             "Usage: !aginah delete-role-category CategoryName"
    )
    @commands.check(is_moderator)
    async def delete_role_category(self, ctx: commands.Context):
        args = ctx.message.content.split(' ')
        if len(args) != 3:
            await ctx.send("Looks like you have a syntax error! `!aginah help create-role-category` for more info.")
            return

        # Fetch requisite data (role channel, category db row, role db rows)
        role_channel = discord.utils.get(ctx.guild.text_channels, name=ROLE_REQUEST_CHANNEL)
        category = self.bot.dbc.execute("SELECT id, messageId FROM role_categories WHERE guildId=? AND category=?",
                                        (ctx.guild.id, args[2])).fetchone()

        # If category does not exist, warn user and do nothing
        if not category:
            await ctx.send("That category does not exist!")
            return

        roles = self.bot.dbc.execute("SELECT * FROM roles WHERE categoryId=?", (category[0],))

        # Delete roles from Discord
        for role in roles:
            await (discord.utils.get(ctx.guild.roles, name=role.role)).delete()

        # Delete roles from db
        self.bot.dbc.execute("DELETE FROM roles WHERE categoryId=?", (category[0],))
        self.bot.db.commit()

        # Delete category message
        message = await role_channel.fetch_message(category[1])
        await message.delete()

        # Delete category
        self.bot.dbc.execute("DELETE FROM role_categories WHERE id=?", (category[0],))
        self.bot.db.commit()

        await ctx.send("Category deleted.")

    @commands.command(
        name="create-role",
        brief="Create a role which may be pinged",
        help="Create a role which may be pinged by anyone on the server\n"
             "Usage: !aginah create-role CategoryName RoleName reaction [description]"
    )
    @commands.check(is_moderator)
    async def create_role(self, ctx: commands.Context):
        args = ctx.message.content.split(' ')
        if len(args) < 5:
            await ctx.send("Looks like you have a syntax error! `!aginah help create-role` for more info.")
            return

        # Ensure role does not exist
        for role in ctx.guild.roles:
            if role.name == args[3]:
                await ctx.send("That role already exists!")
                return

        emoji = args[4] if len(args[4]) == 1 else args[4][1:-1]

        # Fetch category
        category = self.bot.dbc.execute("SELECT * FROM role_categories WHERE guildId=? AND category=?",
                                        (ctx.guild.id, args[2])).fetchone()
        if not category:
            await ctx.send("That category doesn't exist!")
            return

        # Fetch role request channel
        channel = discord.utils.get(ctx.guild.text_channels, name=ROLE_REQUEST_CHANNEL)
        if not channel:
            await ctx.send("It looks like the role requestor is not set up on this server. Please contact an admin.")
            return

        # Fetch role message
        message = await channel.fetch_message(category[3])
        if not message:
            await ctx.send("Something is very wrong here. Hey @FarrakKilhn take a look at this.")
            return

        try:
            # Add reaction to category message
            await message.add_reaction(emoji)
        except:
            await ctx.send("The emoji you tried to use is not available on this server. Please try again.")
            return

        # Add role to Discord
        role = await ctx.guild.create_role(name=args[3], mentionable=True)

        # Add db row
        desc = ' '.join(args[5:]) if len(args) > 5 else None
        self.bot.dbc.execute("INSERT INTO roles (categoryId, role, reaction, description) VALUES (?,?,?,?)",
                             (category[0], role.name.strip(), emoji, desc.strip()))
        self.bot.db.commit()

        # Update message contents to show updated roles
        await message.edit(content=await self.build_category_message(ctx, category))

        await ctx.send("Role created.")

    @commands.command(
        name="delete-role",
        brief="Delete a role created by this bot",
        help="Delete a role created by this bot\n"
             "Usage: !aginah delete-role CategoryName RoleName"
    )
    @commands.check(is_moderator)
    async def delete_role(self, ctx: commands.Context):
        args = ctx.message.content.split(' ')
        if len(args) != 4:
            await ctx.send("Looks like you have a syntax error! `!aginah help delete-role` for more info.")
            return

        role = discord.utils.get(ctx.guild.roles, name=args[3])
        if not role:
            await ctx.send("That role does not exist!")
            return

        # Fetch category
        category = self.bot.dbc.execute("SELECT * FROM role_categories WHERE guildId=? AND category=?",
                                        (ctx.guild.id, args[2],)).fetchone()
        if not category:
            await ctx.send("That category doesn't exist!")
            return

        # Fetch role request channel
        channel = discord.utils.get(ctx.guild.text_channels, name=ROLE_REQUEST_CHANNEL)
        if not channel:
            await ctx.send(
                "It looks like the role requestor is not set up on this server. Please contact an admin.")
            return

        # Fetch role message
        message = await channel.fetch_message(category[3])
        if not message:
            await ctx.send("Something is very wrong here. Hey @FarrakKilhn take a look at this.")
            return

        # Fetch db role
        db_role = self.bot.dbc.execute("SELECT * FROM roles WHERE categoryId=? and role=?",
                                       (category[0], args[3])).fetchone()

        # Remove role from db
        self.bot.dbc.execute("DELETE FROM roles WHERE categoryId=? AND role=?", (category[0], role.name))
        self.bot.db.commit()

        # Delete Discord role
        await role.delete()

        # Edit category message to display updated roles
        await message.edit(content=await self.build_category_message(ctx, category))

        # Remove role reactions from message
        for reaction in message.reactions:
            if reaction.emoji == db_role[3]:
                await reaction.clear()

        # Notify of success
        await ctx.send("Role deleted.")

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, event: discord.RawReactionActionEvent):
        # Do not operate on messages which are not a category message
        skip = True
        valid_ids = self.bot.dbc.execute("SELECT messageId FROM role_categories")
        for msgId in valid_ids:
            if msgId[0] == event.message_id:
                skip = False
                break
        if skip:
            return

        # Fetch guild and member info
        guild = discord.utils.get(self.bot.guilds, id=event.guild_id)
        member = discord.utils.get(guild.members, id=event.user_id)

        # If a bot added a reaction (probably this bot), do nothing
        if member.bot:
            return

        if not guild or not member:
            raise Exception("Unable to determine guild or member to add role.")

        role = await self.fetch_role(event, guild, member)
        await member.add_roles(role)

    @commands.Cog.listener()
    async def on_raw_reaction_remove(self, event: discord.RawReactionActionEvent):
        # Do not operate on messages which are not a category message
        skip = True
        valid_ids = self.bot.dbc.execute("SELECT messageId FROM role_categories")
        for msgId in valid_ids:
            if msgId[0] == event.message_id:
                skip = False
                break
        if skip:
            return

        # Fetch guild and member info
        guild = discord.utils.get(self.bot.guilds, id=event.guild_id)
        member = discord.utils.get(guild.members, id=event.user_id)

        # If a bot added a reaction (probably this bot), do nothing
        if member.bot:
            return

        if not guild or not member:
            raise Exception("Unable to determine guild or member to add role.")

        role = await self.fetch_role(event, guild, member)
        await member.remove_roles(role)


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(RoleRequestor(bot))
