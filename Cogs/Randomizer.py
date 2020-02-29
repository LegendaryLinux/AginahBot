from discord.ext import commands


class Randomizer(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='host-game',
        brief="Tell AginahBot host your multiworld",
        help='Upload a .multidata file to have AginahBot host a multiworld game.'
    )
    async def host_game(self, ctx: commands.Context):
        await ctx.send('Working on it...')


def setup(bot: commands.Bot):
    bot.add_cog(Randomizer(bot))
