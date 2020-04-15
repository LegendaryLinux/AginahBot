from discord.ext import commands


class ErrorHandler(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_command_error(self, ctx: commands.Context, error: commands.CommandError):
        if isinstance(error, commands.CommandNotFound):
            await ctx.send("Sorry, I don't recognize that command. Use `!aginah help` for more info.")
            return

        await ctx.send("Something broke. You might want to submit an issue on the AginahBot GitHub Repo.")
        print(str(error))
        raise error


def setup(bot: commands.Bot):
    bot.add_cog(ErrorHandler(bot))
