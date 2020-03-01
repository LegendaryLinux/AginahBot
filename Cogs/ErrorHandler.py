from discord.ext import commands


class ErrorHandler(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_command_error(self, ctx: commands.Context, error: commands.CommandError):
        await ctx.send("I'm not sure what to do here. If this looks like a problem, maybe contact Farrak.")
        print(str(error))


def setup(bot: commands.Bot):
    bot.add_cog(ErrorHandler(bot))
