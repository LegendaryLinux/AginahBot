import discord
from discord.ext import commands


class HelpfulMessages(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='setup',
        brief="Get instructions on how to set up your computer to play MultiWorlds",
        help="Get instructions on how to set up your computer to play MultiWorlds"
    )
    async def get_setup_video(self, ctx: commands.Context):
        await ctx.send("A written guide may be found here: https://berserkermulti.world/tutorial\n"
                       "A video guide may be found here: https://www.youtube.com/watch?v=mJKEHaiyR_Y")
        return

    @commands.command(
        name='website',
        brief="Get the link to the MultiWorld website",
        help="Get the link to the MultiWorld website"
    )
    async def get_webhost_link(self, ctx: commands.Context):
        await ctx.send("https://berserkermulti.world/")
        return

    @commands.command(
        name='github',
        brief="Get the link to the MultiWorld's GitHub page",
        help="Get the link to the MultiWorld's GitHub page"
    )
    async def get_github_link(self, ctx: commands.Context):
        await ctx.send("https://github.com/Berserker66/MultiWorld-Utilities")
        return


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(HelpfulMessages(bot))
