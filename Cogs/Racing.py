import os
from dotenv import load_dotenv
import discord
import sqlite3
import re
from discord.ext import commands

load_dotenv()
RACING_CATEGORY_NAME = 'Multiworld Races'
RACING_BASE_VOICE_CHANNEL_NAME = 'Start Race'
RACING_VOICE_CHANNEL_NAME = 'Racing Channel '
RACING_TEXT_CHANNEL_NAME = 'racing-channel-'
RACING_ADMIN_ROLE_NAME = 'Tournament Admin'
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')


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
        if discord.utils.get(ctx.guild.categories, name=RACING_CATEGORY_NAME) \
                and discord.utils.get(ctx.guild.voice_channels, name=RACING_BASE_VOICE_CHANNEL_NAME):
            await ctx.send('It looks like your channel is already set up to support multiworld races.')
            return

        # Create the racing category and add the initial channel
        category = await ctx.guild.create_category_channel(RACING_CATEGORY_NAME)
        await category.create_voice_channel(RACING_BASE_VOICE_CHANNEL_NAME)

        # Create a racing admin role
        await ctx.guild.create_role(
            name=RACING_ADMIN_ROLE_NAME,
            permissions=discord.Permissions.none(),
        )

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

        # Delete the racing admin role
        admin_role = discord.utils.get(ctx.guild.roles, name=RACING_ADMIN_ROLE_NAME)
        if admin_role:
            await admin_role.delete()

        # Delete race entries in local db (drop and re-create table)
        db = sqlite3.connect(SQLITE_DB_NAME)
        dbc = db.cursor()
        # noinspection SqlWithoutWhere
        dbc.execute("DELETE FROM races; VACUUM")
        db.commit()

    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.member, before: discord.VoiceState,
                                    after: discord.VoiceState):
        if after and after.channel:
            # Operations for when a user has entered a voice channel
            voice_channel = after.channel
            category = after.channel.category
            guild = after.channel.guild

            # If a user enters the initial voice channel, create two new voice and text channels and move the user
            # into the first racing channel
            if after.channel.name == RACING_BASE_VOICE_CHANNEL_NAME:
                category = discord.utils.get(after.channel.guild.categories, name=RACING_CATEGORY_NAME)

                # Determine the lowest available race number which can be used to create
                # Voice Channel 1A, text-channel-1a, etc
                db = sqlite3.connect(SQLITE_DB_NAME)
                dbc = db.cursor()
                sql = "SELECT IFNULL(MIN(r1.race_number + 1), 1) AS start " \
                      "FROM races AS r1 " \
                      "LEFT OUTER JOIN races as r2 ON r1.race_number + 1 = r2.race_number " \
                      "WHERE r2.race_number IS NULL " \
                      "AND r1.guild=r2.guild"
                channel_number = dbc.execute(sql).fetchone()[0]

                # Save this back to the database as an active race channel number
                dbc.execute("INSERT INTO races (guild, race_number) VALUES (?, ?)", (guild.name, int(channel_number)))
                db.commit()

                # Create new voice channels
                voice_channel_name = RACING_VOICE_CHANNEL_NAME + str(channel_number)
                voice_channel_a = await category.create_voice_channel(name=voice_channel_name + 'A')
                await category.create_voice_channel(name=voice_channel_name + 'B')

                # Create new text channels with no permissions for normal users, add permission
                # overwrites for racing admins
                text_channel_name = RACING_TEXT_CHANNEL_NAME + str(channel_number)
                racing_admin_role = discord.utils.get(guild.roles, name=RACING_ADMIN_ROLE_NAME)
                racing_admin_role_permission_overwrites = discord.PermissionOverwrite(
                    read_messages=True,
                    send_messages=True,
                    embed_links=True,
                    attach_files=True,
                    read_message_history=True,
                    add_reactions=True,
                    external_emojis=True,
                    manage_messages=True,
                    move_members=True,
                )
                await category.create_text_channel(
                    name=text_channel_name + 'a',
                    permissions=discord.Permissions.none(),
                    overwrites={racing_admin_role: racing_admin_role_permission_overwrites}
                )
                await category.create_text_channel(
                    name=text_channel_name + 'b',
                    permissions=discord.Permissions.none(),
                    overwrites={racing_admin_role: racing_admin_role_permission_overwrites}
                )

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
                member_permission_overwrites = discord.PermissionOverwrite(
                    read_messages=True,
                    send_messages=True,
                    embed_links=True,
                    attach_files=True,
                    read_message_history=True,
                    add_reactions=True,
                    external_emojis=True,
                    create_instant_invite=False
                )

                # Grant the user permissions on the corresponding text channel
                await text_channel.edit(overwrites={member: member_permission_overwrites})
                return

        if before and before.channel:
            # Operations for when a user has entered a voice channel
            voice_channel = before.channel  # Find voice channel
            category = before.channel.category  # Find category
            guild = before.channel.guild

            # It's possible a user could disconnect from a custom room in this channel that doesn't match the
            # expected regex. If that happens, do nothing
            race_number = re.findall("(\d*)[AB]$", voice_channel.name)
            if not race_number:
                return

            # If the user has left a racing voice room, revoke their permission to view the corresponding text channel
            if (
                    category
                    and category.name == RACING_CATEGORY_NAME
                    and voice_channel.name.find(RACING_VOICE_CHANNEL_NAME) > -1
            ):
                # Determine name of target text channel based on the name of the voice channel the user left
                target_text_channel_name = RACING_TEXT_CHANNEL_NAME + voice_channel.name[-2:].lower()

                # If the text channel can be found, revoke the user's permissions
                text_channel = discord.utils.get(guild.text_channels, name=target_text_channel_name)
                if text_channel:
                    await text_channel.set_permissions(member, overwrite=None)

            # If there are no users remaining in either voice channel, delete the voice and text channels
            race_number = race_number[0]
            voice_a = discord.utils.get(guild.voice_channels, name=RACING_VOICE_CHANNEL_NAME + race_number + 'A')
            voice_b = discord.utils.get(guild.voice_channels, name=RACING_VOICE_CHANNEL_NAME + race_number + 'B')

            if (voice_a and not voice_a.members) and (voice_b and not voice_b.members):
                # Delete voice channels
                if voice_a:
                    await voice_a.delete()
                if voice_b:
                    await voice_b.delete()

                # Delete text channels
                text_a = discord.utils.get(guild.text_channels, name=RACING_TEXT_CHANNEL_NAME + race_number + 'a')
                text_b = discord.utils.get(guild.text_channels, name=RACING_TEXT_CHANNEL_NAME + race_number + 'b')
                if text_a:
                    await text_a.delete()
                if text_b:
                    await text_b.delete()

            # Remove the active race from the sqlite database
            db = sqlite3.connect(SQLITE_DB_NAME)
            dbc = db.cursor()
            dbc.execute("DELETE FROM races WHERE guild=? and race_number=?", (guild.name, int(race_number)))
            db.commit()


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Racing(bot))
