import os
from dotenv import load_dotenv
import discord
import sqlite3
import re
from discord.ext import commands

load_dotenv()
CATEGORY_NAME = 'SYNC MULTI'
BASE_VOICE_CHANNEL_NAME = 'Start Game'
VOICE_CHANNEL_NAME = 'Multi Channel '
TEXT_CHANNEL_NAME = 'multi-channel-'
ADMIN_ROLE_NAME = 'Casual Admin'
PLAYER_ROLE_NAME = 'Casual Player Game '
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')


async def is_administrator(ctx: commands.Context):
    return ctx.author.guild_permissions.administrator


async def is_moderator(ctx: commands.Context):
    guild_roles = []
    for role in ctx.guild.roles:
        guild_roles.append(role.name)

    moderator_roles = guild_roles[guild_roles.index('Moderator'):]
    return ctx.author.guild_permissions.administrator or (ctx.author.top_role in moderator_roles)


class Casual(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='create-casual-channels',
        brief="Create casual category and channels, if they do not exist",
        help="Create a category with a voice channel which when joined, will create casual channels and"
             " authorize users automatically."
    )
    @commands.check(is_administrator)
    async def create_casual_channels(self, ctx: commands.Context):
        # If the channel from which other channels are created already exists, do nothing
        if discord.utils.get(ctx.guild.categories, name=CATEGORY_NAME) \
                and discord.utils.get(ctx.guild.voice_channels, name=BASE_VOICE_CHANNEL_NAME):
            await ctx.send('It looks like your channel is already set up to support casual multiworld games!')
            return

        # Create the casual category and add the initial channel
        category = await ctx.guild.create_category_channel(CATEGORY_NAME)
        await category.create_voice_channel(BASE_VOICE_CHANNEL_NAME)

        # Create a casual admin role
        await ctx.guild.create_role(
            name=ADMIN_ROLE_NAME,
            permissions=discord.Permissions.none(),
        )

    @commands.command(
        name='destroy-casual-channels',
        brief="Delete casual category and channels.",
        help="Destroy the casual category and everything created by the create-casual-channels command"
    )
    @commands.check(is_administrator)
    async def destroy_casual_channels(self, ctx: commands.Context):
        # If the casual category exists, delete it and all channels within it
        casual_category = discord.utils.get(ctx.guild.categories, name=CATEGORY_NAME)
        casual_channel = discord.utils.get(ctx.guild.voice_channels, name=BASE_VOICE_CHANNEL_NAME)

        # If there is no casual category and no base casual channel, do nothing
        if not casual_category and not casual_channel:
            return

        # Delete all voice and text channels in the casual category
        for channel in casual_category.channels:
            await channel.delete()

        # Delete the casual category
        await casual_category.delete()

        # Delete the admin role
        admin_role = discord.utils.get(ctx.guild.roles, name=ADMIN_ROLE_NAME)
        if admin_role:
            await admin_role.delete()

        # Delete casual entries in local db (drop and re-create table)
        db = sqlite3.connect(SQLITE_DB_NAME)
        dbc = db.cursor()
        dbc.execute("DROP TABLE casuals")
        dbc.execute('CREATE TABLE IF NOT EXISTS casuals ('
                    'id integer not null primary key autoincrement,'
                    'guildId varchar(128) not null,'
                    'game_number integer not null'
                    ')'
                    )
        db.commit()

    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.member, before: discord.VoiceState,
                                    after: discord.VoiceState):
        # If the user changed their voice state but remained in the same voice channel, do nothing
        if before and before.channel and after and after.channel and before.channel == after.channel:
            return

        if after and after.channel:
            # Details about the user's connection
            voice_channel = after.channel
            category = after.channel.category
            guild = after.channel.guild

            # Admin permissions for text channels
            casual_admin_role = discord.utils.get(guild.roles, name=ADMIN_ROLE_NAME)
            casual_admin_role_permission_overwrites = discord.PermissionOverwrite(
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
            # into the first casual channel
            if voice_channel.name == BASE_VOICE_CHANNEL_NAME and category.name == CATEGORY_NAME:
                print(f'User has entered the New Game channel. Looking up next available game number')
                # Determine the lowest available game number which can be used to create
                # Voice Channel 1, text-channel-1, etc
                db = sqlite3.connect(SQLITE_DB_NAME)
                dbc = db.cursor()
                sql = "SELECT IFNULL(MIN(c1.game_number + 1), 1) AS start " \
                      "FROM casuals AS c1 " \
                      "LEFT OUTER JOIN casuals as c2 ON c1.game_number + 1 = c2.game_number " \
                      "WHERE c2.game_number IS NULL"
                channel_number = dbc.execute(sql).fetchone()[0]
                print(f'Found available game number {channel_number}')

                # Save this back to the database as an active game channel number
                print(f'Writing active game {channel_number} to database')
                dbc.execute("INSERT INTO casuals (guildId, game_number) VALUES (?, ?)", (guild.id, int(channel_number)))
                db.commit()

                # Create a new voice channel
                print(f'Creating voice channel for game {channel_number}')
                voice_channel_name = VOICE_CHANNEL_NAME + str(channel_number)
                voice_channel_a = await category.create_voice_channel(name=voice_channel_name)

                if not casual_admin_role:
                    print(f'Unable to determine casual admin role: {ADMIN_ROLE_NAME}')
                    raise LookupError

                # Create player role for text channels
                casual_player_role = await guild.create_role(
                    name=PLAYER_ROLE_NAME + str(channel_number),
                    permissions=discord.Permissions.none(),
                )
                casual_player_role_permission_overwrites = discord.PermissionOverwrite(
                    read_messages=True,
                    send_messages=True,
                    embed_links=True,
                    attach_files=True,
                    read_message_history=True,
                    add_reactions=True,
                    external_emojis=True,
                )

                # Create a new text channel viewable only by admins and AginahBot
                print(f'Creating text channels for game number {channel_number}')
                text_channel_name = TEXT_CHANNEL_NAME + str(channel_number)
                await category.create_text_channel(
                    name=text_channel_name,
                    overwrites={
                        casual_admin_role: casual_admin_role_permission_overwrites,
                        casual_player_role: casual_player_role_permission_overwrites,
                        guild.default_role: discord.PermissionOverwrite(read_messages=False),
                        guild.me: discord.PermissionOverwrite(read_messages=True)
                    }
                )

                # Move user in initial voice channel to the new Voice Channel
                print(f'Moving {member.name} to {voice_channel_a.name}')
                await member.move_to(voice_channel_a)

            # If the user has entered a casual voice room, grant them permission to view the corresponding text channel
            if category.name == CATEGORY_NAME and voice_channel.name.find(VOICE_CHANNEL_NAME) > -1:
                print(f'{member.name} has entered a casual voice room {voice_channel.name}')

                # Determine the game number being acted on
                game_number = re.findall("(\d*)$", voice_channel.name)
                if game_number:
                    print(f'Determined voice channel to be part of game number {game_number[0]}')

                    # Player permissions for text channels
                    casual_player_role = discord.utils.get(guild.roles, name=PLAYER_ROLE_NAME + game_number[0])
                    if casual_player_role:
                        await member.add_roles(casual_player_role)

        if before and before.channel:
            # Details about the user's connection
            voice_channel = before.channel
            category = before.channel.category
            guild = before.channel.guild

            # If the user disconnected from a casual voice room, revoke their permissions on the corresponding
            # text channel and delete the game channel if the voice channel is empty
            if (
                    category
                    and category.name == CATEGORY_NAME
                    and voice_channel.name.find(VOICE_CHANNEL_NAME) > -1
            ):
                # Determine the game number
                game_number = re.findall("(\d*)$", voice_channel.name)[0]
                print(f'User left a voice channel in game number {game_number}')

                # Remove the casual game role form this player
                casual_player_role = discord.utils.get(guild.roles, name=PLAYER_ROLE_NAME + game_number)
                if casual_player_role:
                    await member.remove_roles(casual_player_role)

                # If there are no users remaining in the voice channel, delete the voice and text channels
                print(f'Checking casual voice channels for members present')
                voice_a = discord.utils.get(category.voice_channels, name=VOICE_CHANNEL_NAME + game_number)

                if voice_a and not voice_a.members:
                    # Delete voice channels
                    print(f'Deleting voice channel {voice_a.name}')
                    await voice_a.delete()

                    # Delete text channels
                    text_a = discord.utils.get(category.text_channels, name=TEXT_CHANNEL_NAME + game_number)
                    print(f'Deleting text channel {text_a.name}')
                    if text_a:
                        await text_a.delete()

                    # Delete the casual game role
                    print(f'Deleting role {casual_player_role}')
                    if casual_player_role:
                        await casual_player_role.delete()

                    # Remove the active game from the sqlite database
                    print(f'Deleting game {game_number} from the database')
                    db = sqlite3.connect(SQLITE_DB_NAME)
                    dbc = db.cursor()
                    dbc.execute("DELETE FROM casuals WHERE guildId=? and game_number=?", (guild.id, int(game_number)))
                    db.commit()


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Casual(bot))
