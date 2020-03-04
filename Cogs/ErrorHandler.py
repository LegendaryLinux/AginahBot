from discord.ext import commands


class ErrorHandler(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_command_error(self, ctx: commands.Context, error: commands.CommandError):
        await ctx.send("Either something broke, or you gave me a command I don't recognize.")
        print(str(error))
        raise error


def setup(bot: commands.Bot):
    bot.add_cog(ErrorHandler(bot))
