from discord.ext import commands


class Commands:
    @staticmethod
    async def be_crotchety(ctx: commands.Context, bot: commands.Bot):
        # The bot shouldn't invoke itself
        if ctx.author == bot.user:
            return

        await ctx.send("I'm an old man, leave me alone!")
