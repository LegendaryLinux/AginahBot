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
    async def create_race_channels(self, ctx: commands.Context):
        # If the channel from which other channels are created already exists, do nothing
        if discord.utils.get(ctx.guild.categories, name=RACING_CATEGORY_NAME) \
                and discord.utils.get(ctx.guild.voice_channels, name=RACING_BASE_VOICE_CHANNEL_NAME):
            await ctx.send('It looks like your channel is already set up to support multiworld races!')
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
        dbc.execute("DROP TABLE races")
        dbc.execute('CREATE TABLE IF NOT EXISTS races ('
                    'id integer not null primary key autoincrement,'
                    'guild varchar(128) not null,'
                    'race_number integer not null'
                    ')'
                    )
        db.commit()

    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.member, before: discord.VoiceState,
                                    after: discord.VoiceState):
        if after and after.channel:
            # Details about the user's connection
            voice_channel = after.channel
            category = after.channel.category
            guild = after.channel.guild

            # Admin permissions for text channels
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

            # If a user enters the initial voice channel, create two new voice and text channels and move the user
            # into the first racing channel
            if voice_channel.name == RACING_BASE_VOICE_CHANNEL_NAME and category.name == RACING_CATEGORY_NAME:
                print(f'User has entered the New Race channel. Looking up next available race number')
                # Determine the lowest available race number which can be used to create
                # Voice Channel 1A, text-channel-1a, etc
                db = sqlite3.connect(SQLITE_DB_NAME)
                dbc = db.cursor()
                sql = "SELECT IFNULL(MIN(r1.race_number + 1), 1) AS start " \
                      "FROM races AS r1 " \
                      "LEFT OUTER JOIN races as r2 ON r1.race_number + 1 = r2.race_number " \
                      "WHERE r2.race_number IS NULL"
                channel_number = dbc.execute(sql).fetchone()[0]
                print(f'Found available race number {channel_number}')

                # Save this back to the database as an active race channel number
                print(f'Writing active race {channel_number} to database')
                dbc.execute("INSERT INTO races (guild, race_number) VALUES (?, ?)", (guild.name, int(channel_number)))
                db.commit()

                # Create new voice channels
                print(f'Creating voice channels for race {channel_number}')
                voice_channel_name = RACING_VOICE_CHANNEL_NAME + str(channel_number)
                voice_channel_a = await category.create_voice_channel(name=voice_channel_name + 'A')
                await category.create_voice_channel(name=voice_channel_name + 'B')

                # Create new text channels viewable only by racing admins and AginahBot
                print(f'Creating text channels for race number {channel_number}')
                text_channel_name = RACING_TEXT_CHANNEL_NAME + str(channel_number)
                await category.create_text_channel(
                    name=text_channel_name + 'a',
                    overwrites={
                        racing_admin_role: racing_admin_role_permission_overwrites,
                        guild.default_role: discord.PermissionOverwrite(read_messages=False),
                        guild.me: discord.PermissionOverwrite(read_messages=True)
                    }
                )
                await category.create_text_channel(
                    name=text_channel_name + 'b',
                    overwrites={
                        racing_admin_role: racing_admin_role_permission_overwrites,
                        guild.default_role: discord.PermissionOverwrite(read_messages=False),
                        guild.me: discord.PermissionOverwrite(read_messages=True)
                    }
                )

                # Move user in initial voice channel to the new Voice Channel A
                print(f'Moving {member.name} to {voice_channel_a.name}')
                await member.move_to(voice_channel_a)

            # If the user has entered a racing voice room, grant them permission to view the corresponding text channel
            if category.name == RACING_CATEGORY_NAME and voice_channel.name.find(RACING_VOICE_CHANNEL_NAME) > -1:
                print(f'{member.name} has entered a racing voice room {voice_channel.name}')

                # Determine the race number being acted on
                race_number = re.findall("(\d*)[AB]$", voice_channel.name)
                if race_number:
                    print(f'Determined voice channel to be part of race number {race_number[0]}')

                    # Determine name of target text channel based on the name of the voice channel the user joined
                    text_channel_name = RACING_TEXT_CHANNEL_NAME + race_number[0] + voice_channel.name[-1].lower()
                    print(f'Attempting to look up text channel {text_channel_name}')

                    # If the text channel does not exist, this is a no-op
                    text_channel = discord.utils.get(after.channel.guild.text_channels, name=text_channel_name)
                    if text_channel:
                        # Grant the user permissions on the corresponding text channel
                        print(f'Text channel located. Granting permissions')
                        await text_channel.edit(overwrites={
                            racing_admin_role: racing_admin_role_permission_overwrites,
                            guild.default_role: discord.PermissionOverwrite(read_messages=False),
                            guild.me: discord.PermissionOverwrite(read_messages=True),
                            member: discord.PermissionOverwrite(read_messages=True)
                        })

        if before and before.channel:
            # Details about the user's connection
            voice_channel = before.channel
            category = before.channel.category
            guild = before.channel.guild

            # Admin permissions for text channels
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

            # If the user disconnected from a racing voice room, revoke their permissions on the corresponding
            # text channel and delete the race channels if both voice channels are empty
            if (
                    category
                    and category.name == RACING_CATEGORY_NAME
                    and voice_channel.name.find(RACING_VOICE_CHANNEL_NAME) > -1
            ):
                # Determine the race number
                race_number = re.findall("(\d*)[AB]$", voice_channel.name)[0]
                print(f'User left a voice channel in race number {race_number}')

                # Determine name of text channel to revoke permissions on based on the name of the voice
                # channel the user left
                text_channel_name = RACING_TEXT_CHANNEL_NAME + race_number + voice_channel.name[-1].lower()
                print(f'Attempting to revoke permissions on #{text_channel_name}')

                # If the text channel can be found, revoke the user's permissions
                text_channel = discord.utils.get(category.text_channels, name=text_channel_name)
                print(f'Text channel located. Revoking permissions')
                if text_channel:
                    await text_channel.edit(overwrites={
                        racing_admin_role: racing_admin_role_permission_overwrites,
                        guild.default_role: discord.PermissionOverwrite(read_messages=False),
                        guild.me: discord.PermissionOverwrite(read_messages=True),
                        member: discord.PermissionOverwrite(read_messages=False)
                    }),

                # If there are no users remaining in either voice channel, delete the voice and text channels
                print(f'Checking racing voice channels for members present')
                voice_a = discord.utils.get(category.voice_channels, name=RACING_VOICE_CHANNEL_NAME + race_number + 'A')
                voice_b = discord.utils.get(category.voice_channels, name=RACING_VOICE_CHANNEL_NAME + race_number + 'B')

                if (voice_a and not voice_a.members) and (voice_b and not voice_b.members):
                    # Delete voice channels
                    print(f'Deleting voice channels {voice_a.name} and {voice_b.name}')
                    await voice_a.delete()
                    await voice_b.delete()

                    # Delete text channels
                    text_a = discord.utils.get(category.text_channels,
                                               name=RACING_TEXT_CHANNEL_NAME + race_number + 'a')
                    text_b = discord.utils.get(category.text_channels,
                                               name=RACING_TEXT_CHANNEL_NAME + race_number + 'b')
                    print(f'Deleting text channels {text_a.name} and {text_b.name}')
                    if text_a:
                        await text_a.delete()
                    if text_b:
                        await text_b.delete()

                    # Remove the active race from the sqlite database
                    print(f'Deleting race {race_number} from the database')
                    db = sqlite3.connect(SQLITE_DB_NAME)
                    dbc = db.cursor()
                    dbc.execute("DELETE FROM races WHERE guild=? and race_number=?", (guild.name, int(race_number)))
                    db.commit()


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Racing(bot))
