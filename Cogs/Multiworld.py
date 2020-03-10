import os
import sqlite3
import aiohttp
import aiofiles
import asyncio
import string
import requests
import random
import json
import websockets
import functools
import zlib
import multiprocessing as mp
from random import choice
from discord.ext import commands
from dotenv import load_dotenv

# Berserker's Files
import MultiServer

# Load environment variables
load_dotenv()
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')
BERSERKER_PATH = os.getenv('BERSERKER_PATH')

# Find the public ip address of the current machine
MULTIWORLD_HOST = requests.get('https://checkip.amazonaws.com').text.strip()


class Multiworld(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.db = sqlite3.connect(SQLITE_DB_NAME)
        self.cursor = self.db.cursor()

    @staticmethod
    async def gen_token(prefix: str = '') -> str:
        return prefix.join(choice(string.ascii_uppercase) for x in range(4))

    @staticmethod
    async def server_loop(func):
        loop = asyncio.get_event_loop()
        loop.run_until_complete(func)
        loop.close()
        # loop.run_forever()

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

        # TODO: Parse command arguments from ctx

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

        # Ensure the MultiWorld.py file exists on the local machine
        if not os.path.exists(BERSERKER_PATH):
            await ctx.send(
                "It looks like your bot maintainer doesn't have his environment variables set correctly."
                " I can't host your game until they fix that. Sorry!")
            return

        # TODO: Choose a port from 5000 to 7000 and ensure it is not in use
        while True:
            port = random.randrange(5000, 7000)
            break

        args = {
            'port': port,
            'multidata': f'multidata/{token}_multidata',
            'hint_cost': 1,
        }
        server_loop = asyncio.get_event_loop().run_until_complete(MultiServer.main(args))

        # mw_proc = mp.Process(target=self.start_berserker_server, args=(ctx,))
        # mw_proc.start()

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
