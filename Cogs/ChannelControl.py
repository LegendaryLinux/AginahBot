import discord
from discord.ext import commands

RACING_CATEGORY_NAME = 'Multiworld Races'
RACING_BASE_VOICE_CHANNEL_NAME = 'Start Race'
RACING_VOICE_CHANNEL_NAME = 'Racing Channel '
RACING_TEXT_CHANNEL_NAME = 'racing-channel-'

CASUAL_CATEGORY_NAME = 'Multiworld Games'
CASUAL_BASE_VOICE_CHANNEL_NAME = 'Start Game'
CASUAL_VOICE_CHANNEL_NAME = 'Multiworld Channel '
CASUAL_TEXT_CHANNEL_NAME = 'multiworld-channel-'


class ChannelControl(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='setup-race-channels',
        brief="Create racing category and channels, if they do not exist",
        help="Create a category with a voice channel which when joined, will create race channels and"
             " authorize users automatically."
    )
    @commands.is_owner()
    async def setup_race_channels(self, ctx: commands.Context):
        # If the channel from which other channels are created already exists, do nothing
        if discord.utils.get(ctx.guild.categories, name='Racing')\
                and discord.utils.get(ctx.guild.voice_channels, name=RACING_BASE_VOICE_CHANNEL_NAME):
            return

        # Create the racing category and add the initial channel
        category = await ctx.guild.create_category_channel(RACING_CATEGORY_NAME)
        await category.create_voice_channel(RACING_BASE_VOICE_CHANNEL_NAME)

        # Create a racers role
        await ctx.guild.create_role('Racers')

    @commands.command(
        name='destroy-race-channels',
        brief="Delete racing category and channels.",
        help="Destroy the racing category and everything created by the setup-race-channels command"
    )
    @commands.is_owner()
    async def destroy_race_channels(self, ctx: commands.Context):
        # If the racing category exists, delete it and all channels within it
        race_category = discord.utils.get(ctx.guild.categories, name='Racing')
        race_channel = discord.utils.get(ctx.guild.voice_channels, name=RACING_BASE_VOICE_CHANNEL_NAME)

        # If there is no racing category and no base racing channel, do nothing
        if not race_category and not race_channel:
            return

        # Delete all voice and text channels in the racing category
        for channel in race_category.channels:
            await channel.delete()

        # Delete the racing category
        await race_category.delete()


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(ChannelControl(bot))
