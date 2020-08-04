import discord
from discord.ext import commands


class RoleRequestor(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='create-role',
        brief="Create a role which may be pinged",
        help="Create a role which may be pinged by anyone on the server\n"
             "Usage: !aginah create-role RoleName"
    )
    async def create_role(self, ctx: commands.Context):
        args = ctx.message.content.split(' ')
        if len(args) < 3:
            await ctx.send('You\'ve got a syntax error! You must include the role to create.\n'
                           '`!aginah help create-role` for more information.')
            return

        if len(args) > 3:
            await ctx.send('You\'ve got a syntax error! Only one new role may be created at a time.\n'
                           '!aginah create-role` for more information.')
            return

        if not args[2].isalnum():
            await ctx.send('You\'ve got a syntax error! Role names must be alphanumeric.')
            return

        for role in ctx.guild.roles:
            if args[2] == role.name:
                await ctx.send(f"{role.name} already exists!")
                return

        await ctx.guild.create_role(args[2])
        await ctx.send(f"{args[2]} has been created! Use `!aginah grant-role RoleName` to grant this role to yourself.")
        return

    @commands.command(
        name='grant-role',
        brief="",
        help=""
    )
    async def grant_role(self, ctx: commands.Context):
        # TODO: Figure out how to disallow assigning yourself privileged roles
        pass


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(RoleRequestor(bot))
