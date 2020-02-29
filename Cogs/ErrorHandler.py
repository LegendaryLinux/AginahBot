from discord.ext import commands


class ErrorHandler(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_command_error(self, ctx: commands.Context, error: commands.CommandError):
        await ctx.send("I don't know that command! Try asking for help with `!aginah help`")


def setup(bot: commands.Bot):
    bot.add_cog(ErrorHandler(bot))
