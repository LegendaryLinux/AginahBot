import discord
from discord.ext import commands

CASUAL_CATEGORY_NAME = 'Multiworld Games'
CASUAL_BASE_VOICE_CHANNEL_NAME = 'Start Game'
CASUAL_VOICE_CHANNEL_NAME = 'Multiworld Channel '
CASUAL_TEXT_CHANNEL_NAME = 'multiworld-channel-'
CASUAL_ROLE = 'MultiworldPlayer'


class Casual(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='create-multiworld-channels',
        brief='Create multiworld category and channels, if they do not exist',
        help='Create a category with a voice channel which when joined, will create race channels and'
             ' authorize users automatically.'
    )
    @commands.is_owner()
    async def create_multiworld_channels(self, ctx: commands.Context):
        # If the channel from which other channels are created already exists, do nothing
        if discord.utils.get(ctx.guild.categories, name=CASUAL_CATEGORY_NAME) \
                and discord.utils.get(ctx.guild.voice_channels, name=CASUAL_BASE_VOICE_CHANNEL_NAME):
            await ctx.send('It looks like your channel is already set up to handle multiworld games.')
            return

        # Create a casual role with no permissions
        await ctx.guild.create_role(name=CASUAL_ROLE, permissions=discord.Permissions().none())

        # Create the racing category and add the initial channel
        category = await ctx.guild.create_category_channel(CASUAL_CATEGORY_NAME)
        await category.create_voice_channel(CASUAL_BASE_VOICE_CHANNEL_NAME)

    @commands.command(
        name='destroy-multiworld-channels',
        brief="Delete multiworld category and channels.",
        help="Destroy the multiworld category and everything created by the create-multiworld-channels command"
    )
    @commands.is_owner()
    async def destroy_multiworld_channels(self, ctx: commands.Context):
        # If the multiworld category exists, delete it and all channels within it
        casual_category = discord.utils.get(ctx.guild.categories, name=CASUAL_CATEGORY_NAME)
        casual_channel = discord.utils.get(ctx.guild.voice_channels, name=CASUAL_BASE_VOICE_CHANNEL_NAME)

        # If there is no racing category and no base racing channel, do nothing
        if not casual_category and not casual_channel:
            return

        # Delete all voice and text channels in the racing category
        for channel in casual_category.channels:
            await channel.delete()

        # Delete the racing category
        await casual_category.delete()

        casual_role = discord.utils.get(ctx.guild.roles, name=CASUAL_ROLE)
        if casual_role:
            await casual_role.delete()

    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.member, before: discord.VoiceState,
                                    after: discord.VoiceState):
        # TODO: Handle users entering and leaving multiworld voice channels
        pass


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Casual(bot))
