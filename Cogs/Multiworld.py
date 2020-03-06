import os
import sqlite3
import subprocess
import aiohttp
import aiofiles
import string
from random import choice
from discord.ext import commands
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')


class Multiworld(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.db = sqlite3.connect(SQLITE_DB_NAME)
        self.cursor = self.db.cursor()

    @staticmethod
    async def gen_token():
        return ''.join(choice(string.ascii_uppercase) for x in range(4))

    @commands.command(
        name='host-berserker',
        brief="Use AginahBot to host your berserker-style multiworld",
        help='Upload a .multidata file to have AginahBot host a berserker-style multiworld game.\n'
             'Usage: !aginah host-berserker [check_points [hint_cost [allow_cheats]]]'
    )
    async def host_berserker(self, ctx: commands.Context):
        if not ctx.message.attachments:
            await ctx.send("Did you forget to attach a multidata file?")
            return

        # TODO: Parse command arguments

        # Generate a multiworld token and ensure it is not in use already
        while True:
            token = await self.gen_token()
            self.cursor.execute('SELECT 1 FROM hosted_games WHERE guild=? and token=?', (ctx.guild.name, token,))
            if not self.cursor.fetchone():
                break

        # Save the multidata file to the /multidata folder
        multidata_url = ctx.message.attachments[0].url
        async with aiohttp.ClientSession() as session:
            async with session.get(multidata_url) as res:
                async with aiofiles.open(f'multidata/{token}_multidata', 'wb') as multidata_file:
                    await multidata_file.write(await res.read())

        # TODO Spawn a new multiworld host process
        proc = subprocess.Popen(['python'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=None)
        print(f'Started a new multiworld-host process with pid {proc.pid}')

        # TODO: Log process info to database

        # TODO: Send host details to client

    @commands.command(
        name='resume-game',
        brief='Re-host a game previously hosted by AginahBot',
        help='Re-host a timed-out or closed game previously hosted by AginahBot.\n'
             'Usage: !aginah resume-game {token} {check_points} {hint_cost} {allow_cheats}',
    )
    async def resume_game(self, ctx: commands.Context):
        # TODO: Check for presence of multidata file with given token

        # TODO: Spawn a new subprocess hosting the game

        # TODO: Send host details to client
        pass

    @commands.command(
        name='send-command',
        brief='Send a command to an in-progress multiworld game',
        help='Send a console command to an in-progress multiworld game.\n'
             'Usage: !aginah send-command {token} {command}',
    )
    async def send_command(self, ctx: commands.Context):
        # TODO: Get existing process via token lookup

        # TODO: Send client message to the process via stdin
        pass

    @commands.command(
        name='end-game',
        brief='Close a multiworld server',
        help='Shut down a multiworld server. Current players will be disconnected and new players will '
             'be unable to join.\n'
             'Usage: !aginah end-game {token}',
    )
    async def end_game(self, ctx: commands.Context):
        # TODO: Get existing process via token lookup

        # TODO: Terminate process
        pass

def setup(bot: commands.Bot):
    bot.add_cog(Multiworld(bot))