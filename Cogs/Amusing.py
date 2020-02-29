from discord.ext import commands


class Amusing(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='hello',
        brief="Say hi to Aginah!",
        help="Say hi to Aginah! Be careful, he's crotchety."
    )
    async def be_crotchety(self, ctx: commands.Context):
        # The bot shouldn't invoke itself
        if ctx.author == self.bot.user:
            return

        await ctx.send("I'm an old man, leave me alone!")


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Amusing(bot))
