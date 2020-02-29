import discord
from discord.ext import commands

RACING_CATEGORY_NAME = 'Multiworld Races'
RACING_BASE_VOICE_CHANNEL_NAME = 'Start Race'
RACING_VOICE_CHANNEL_NAME = 'Racing Channel '
RACING_TEXT_CHANNEL_NAME = 'racing-channel-'


class Racing(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='create-race-channels',
        brief="Create racing category and channels, if they do not exist",
        help="Create a category with a voice channel which when joined, will create race channels and"
             " authorize users automatically."
    )
    @commands.is_owner()
    async def setup_race_channels(self, ctx: commands.Context):
        # If the channel from which other channels are created already exists, do nothing
        if discord.utils.get(ctx.guild.categories, name=RACING_CATEGORY_NAME)\
                and discord.utils.get(ctx.guild.voice_channels, name=RACING_BASE_VOICE_CHANNEL_NAME):
            await ctx.send('It looks like your channel is already set up to support multiworld races.')
            return

        # Create the racing category and add the initial channel
        category = await ctx.guild.create_category_channel(RACING_CATEGORY_NAME)
        await category.create_voice_channel(RACING_BASE_VOICE_CHANNEL_NAME)

    @commands.command(
        name='destroy-race-channels',
        brief="Delete racing category and channels.",
        help="Destroy the racing category and everything created by the create-race-channels command"
    )
    @commands.is_owner()
    async def destroy_race_channels(self, ctx: commands.Context):
        # If the racing category exists, delete it and all channels within it
        race_category = discord.utils.get(ctx.guild.categories, name=RACING_CATEGORY_NAME)
        race_channel = discord.utils.get(ctx.guild.voice_channels, name=RACING_BASE_VOICE_CHANNEL_NAME)

        # If there is no racing category and no base racing channel, do nothing
        if not race_category and not race_channel:
            return

        # Delete all voice and text channels in the racing category
        for channel in race_category.channels:
            await channel.delete()

        # Delete the racing category
        await race_category.delete()

    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.member, before: discord.VoiceState,
                                    after: discord.VoiceState):
        if after:
            # Gather current user state info
            voice_channel = after.channel
            category = after.channel.category
            guild = after.channel.guild

            # If a user enters the initial voice channel, create two new voice and text channels and move the user
            # into the first racing channel
            if after and (after.channel.name == RACING_BASE_VOICE_CHANNEL_NAME):
                category = discord.utils.get(after.channel.guild.categories, name=RACING_CATEGORY_NAME)

                # Used to create Voice Channel 1A, text-channel-1a, etc
                channel_number = len(category.voice_channels)

                # Create new voice channels
                voice_channel_name = RACING_VOICE_CHANNEL_NAME + str(channel_number)
                voice_channel_a = await category.create_voice_channel(name=voice_channel_name + 'A')
                await category.create_voice_channel(name=voice_channel_name + 'B')

                # Create new text channels, disallow reading
                text_channel_name = RACING_TEXT_CHANNEL_NAME + str(channel_number)
                permissions = discord.Permissions.none()
                await category.create_text_channel(name=text_channel_name + 'a', permissions=permissions)
                await category.create_text_channel(name=text_channel_name + 'b', permissions=permissions)

                # Move user in initial voice channel to new voice channel a
                await member.move_to(voice_channel_a)
                return

            # If the user has entered a racing voice room, grant them permission to view the corresponding text channel
            if category.name == RACING_CATEGORY_NAME and voice_channel.name.find(RACING_VOICE_CHANNEL_NAME) > -1:
                # Determine name of target text channel based on the name of the voice channel the user joined
                target_text_channel_name = RACING_TEXT_CHANNEL_NAME + voice_channel.name[-2:].lower()

                # If the text channel does not exist, this is a no-op
                text_channel = discord.utils.get(after.channel.guild.text_channels, name=target_text_channel_name)
                if not text_channel:
                    return

                # Grant user permission to use the text channel
                await text_channel.edit(overwrites={member: discord.PermissionOverwrite(
                    read_messages=True,
                    send_messages=True,
                    embed_links=True,
                    attach_files=True,
                    read_message_history=True,
                    external_emojis=True,
                )})
                return

        if before:
            # Gather user state info
            voice_channel = before.channel  # Find voice channel
            category = before.channel.category  # Find category
            guild = before.channel.guild

            # If the user has left a racing voice room, revoke their permission to view the corresponding text channel
            # TODO: Write this
            if category.name == RACING_CATEGORY_NAME:

                return


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Racing(bot))
