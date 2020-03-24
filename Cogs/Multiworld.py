import aiohttp
import aiofiles
import functools
import json
import os
import requests
import socket
import string
import websockets
import zlib
from discord.ext import commands
from re import findall
from random import choice, randrange

# Skip Berserker's automatically attempting to install requirements from a file
import ModuleUpdate
ModuleUpdate.update_ran = True

# Import Berserker's MultiServer file
import MultiServer

# Find the public ip address of the current machine
MULTIWORLD_HOST = requests.get('https://checkip.amazonaws.com').text.strip()


class Multiworld(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @staticmethod
    async def gen_token(prefix: str = '') -> str:
        return prefix.join(choice(string.ascii_uppercase) for x in range(4))

    @staticmethod
    def get_open_port():
        # Choose a port from 5000 to 7000 and ensure it is not in use
        while True:
            port = randrange(5000, 7000)
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                if not sock.connect_ex(('localhost', port)) == 0:
                    return port

    @staticmethod
    def create_multi_server(port: int, token: str, check_points: int, hint_cost: int, allow_cheats: bool = False):
        # Create and configure MultiWorld server
        multi = MultiServer.Context('0.0.0.0', port, None, check_points, hint_cost, allow_cheats)
        multi.data_filename = f'multidata/{token}_multidata'
        multi.save_filename = f'multidata/{token}_multisave'

        # Configure multidata
        with open(multi.data_filename, 'rb') as f:
            json_obj = json.loads(zlib.decompress(f.read()).decode("utf-8"))
            for team, names in enumerate(json_obj['names']):
                for player, name in enumerate(names, 1):
                    multi.player_names[(team, player)] = name
            multi.rom_names = {tuple(rom): (team, slot) for slot, team, rom in json_obj['roms']}
            multi.remote_items = set(json_obj['remote_items'])
            multi.locations = {tuple(k): tuple(v) for k, v in json_obj['locations']}

        # Configure multisave
        # TODO: This does not seem to load save data
        if os.path.exists(multi.save_filename):
            with open(multi.save_filename, 'rb') as f:
                json_obj = json.loads(zlib.decompress(f.read()).decode("utf-8"))
                multi.set_save(json_obj)

        multi.server = websockets.serve(functools.partial(MultiServer.server, ctx=multi), multi.host, multi.port,
                                        ping_timeout=None, ping_interval=None)
        return multi

    @commands.command(
        name='host-game',
        brief="Use AginahBot to host your multiworld",
        help='Upload a .multidata file to have AginahBot host a multiworld game. Games will be automatically closed '
             'after eight hours.\n'
             'Default values for arguments are shown below. Providing any value to allow_cheats will enable them.\n'
             'Usage: !aginah host-game {check_points=1} {hint_cost=50} {allow_cheats=False}',
    )
    async def host_game(self, ctx: commands.Context):
        if not ctx.message.attachments:
            await ctx.send("Did you forget to attach a multidata file?")
            return

        # Parse command arguments from ctx
        cmd_args = ctx.message.content.split()
        check_points = cmd_args[2] if 0 <= 2 < len(cmd_args) else 1
        hint_cost = cmd_args[3] if 0 <= 3 < len(cmd_args) else 50
        allow_cheats = True if 0 <= 4 < len(cmd_args) else False

        # Generate a multiworld token and ensure it is not in use already
        while True:
            token = await self.gen_token()
            if token not in ctx.bot.servers:
                break

        # Save the multidata file to the /multidata folder
        multidata_url = ctx.message.attachments[0].url
        async with aiohttp.ClientSession() as session:
            async with session.get(multidata_url) as res:
                async with aiofiles.open(f'multidata/{token}_multidata', 'wb') as multidata_file:
                    await multidata_file.write(await res.read())

        # Find an open port
        port = self.get_open_port()

        # Host game and store in ctx.bot.servers
        ctx.bot.servers[token] = {
            'host': MULTIWORLD_HOST,
            'port': port,
            'game': self.create_multi_server(port, token, check_points, hint_cost, allow_cheats)
        }
        # TODO: Implement server expiration after eight hours
        await ctx.bot.servers[token]['game'].server

        # Send host details to client
        await ctx.send(f"Your game has been hosted.\nHost: `{MULTIWORLD_HOST}:{port}`\nToken: `{token}`")

    @commands.command(
        name='resume-game',
        brief='Re-host a game previously hosted by AginahBot',
        help='Re-host a timed-out or closed game previously hosted by AginahBot.\n'
             'Default values for arguments are shown below. Providing any value to allow_cheats will enable them.\n'
             'Usage: !aginah resume-game {token} {check_points=1} {hint_cost=50} {allow_cheats=False}',
    )
    async def resume_game(self, ctx: commands.Context):
        # Parse command arguments from ctx
        cmd_args = ctx.message.content.split()
        token = cmd_args[2] if 0 <= 2 < len(cmd_args) else None
        check_points = cmd_args[3] if 0 <= 3 < len(cmd_args) else 1
        hint_cost = cmd_args[4] if 0 <= 4 < len(cmd_args) else 50
        allow_cheats = True if 0 <= 5 < len(cmd_args) else False

        # Ensure a token is provided
        if not token:
            await ctx.send('You forgot to give me a token! Use `!aginah help resume-game` for more details.')
            return

        # Ensure token is of correct length
        match = findall("^[A-z]{4}$", token)
        if not len(match) == 1:
            await ctx.send("That token doesn't look right. Use `!aginah help resume-game` for more details.")
            return

        # Enforce token formatting
        token = str(token).upper()

        # Check if game is already running
        if token in ctx.bot.servers:
            await ctx.send(f'It looks like a game with that token is already underway!\n'
                           f'Host: {MULTIWORLD_HOST}:{ctx.bot.servers[token]["port"]}')
            return

        # Check for presence of multidata file with given token
        if not os.path.exists(f'multidata/{token}_multidata'):
            await ctx.send('Sorry, no previous game with that token could be found.')
            return

        # Find an open port
        port = self.get_open_port()

        # Host game and store in ctx.bot.servers
        ctx.bot.servers[token] = {
            'host': MULTIWORLD_HOST,
            'port': port,
            'game': self.create_multi_server(port, token, check_points, hint_cost, allow_cheats)
        }
        await ctx.bot.servers[token]['game'].server

        # Send host details to client
        await ctx.send(f"Your game has been hosted.\nHost: `{MULTIWORLD_HOST}:{port}`")

    @commands.command(
        name='end-game',
        brief='Close a multiworld server',
        help='Shut down a multiworld server. Current players will be disconnected, new players will '
             'be unable to join, and the game will not be able to be resumed.\n'
             'Usage: !aginah end-game {token}',
    )
    @commands.is_owner()
    async def end_game(self, ctx: commands.Context):
        # Parse command
        matches = findall("^\!aginah end-game ([A-z]{4})$", ctx.message.content)
        if not len(matches) == 1:
            await ctx.send("Your command doesn't look right. Use `!aginah help end-game` for more info.")
            return

        # Enforce token formatting
        token = str(matches[0]).upper()

        if token not in ctx.bot.servers:
            await ctx.send("No game with that token is currently running")
            return

        # Kill the server if it exists
        if token in ctx.bot.servers:
            await ctx.bot.servers[token]['game'].server.ws_server._close()
            del ctx.bot.servers[token]

        # Delete multidata file
        if os.path.exists(f'multidata/{token}_multidata'):
            os.remove(f'multidata/{token}_multidata')

        # Delete multisave file
        if os.path.exists(f'multidata/{token}_multisave'):
            os.remove(f'multidata/{token}_multisave')

        await ctx.send("The game has been closed.")

    @commands.command(
        name='purge-files',
        brief='Delete all multidata and multisave files not currently in use',
        help='Delete all multidata and multisave files in the ./multidata directory which are not currently '
             'in use by an active server\n'
             'Usage: !aginah purge-files'
    )
    @commands.is_owner()
    async def purge_files(self, ctx: commands.Context):
        # Loop over all files in the ./multidata directory
        for file in os.scandir('./multidata'):
            # Determine file token string
            token = findall("^([A-Z]{4})_(multisave|multidata)$", file.name)
            # If a token match is found and a game with that token is not currently running, delete the file
            if token and token[0] not in ctx.bot.servers:
                os.remove(file.path)


def setup(bot: commands.Bot):
    bot.add_cog(Multiworld(bot))
