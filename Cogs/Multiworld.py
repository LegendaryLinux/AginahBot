import os
import aiohttp
import aiofiles
import socket
import string
import requests
from shlex import quote
from re import findall
from subprocess import Popen, PIPE, DEVNULL
from random import choice, randrange
from discord.ext import commands
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')
BERSERKER_PATH = os.getenv('BERSERKER_PATH')

# Find the public ip address of the current machine
MULTIWORLD_HOST = requests.get('https://checkip.amazonaws.com').text.strip()


class Multiworld(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @staticmethod
    async def gen_token(prefix: str = '') -> str:
        return prefix.join(choice(string.ascii_uppercase) for x in range(4))

    @staticmethod
    def is_port_in_use(port: int):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            return sock.connect_ex(('localhost', port)) == 0

    @commands.command(
        name='host-berserker',
        brief="Use AginahBot to host your berserker-style multiworld",
        help='Upload a .multidata file to have AginahBot host a berserker-style multiworld game.\n'
             'Default values for arguments are shown below. Providing any value to allow_cheats will enable them.\n'
             'Usage: !aginah resume-game {check_points=1} {hint_cost=50} {allow_cheats=False}',
    )
    async def host_berserker(self, ctx: commands.Context):
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

        # Ensure the MultiWorld.py file exists on the local machine
        if not os.path.exists(BERSERKER_PATH):
            await ctx.send(
                "It looks like your bot maintainer doesn't have his environment variables set correctly."
                " I can't host your game until they fix that. Sorry!")
            return

        # Choose a port from 5000 to 7000 and ensure it is not in use
        while True:
            port = randrange(5000, 7000)
            if not self.is_port_in_use(port):
                break

        proc_args = [
            'python', BERSERKER_PATH,
            '--port', str(port),
            '--multidata', f'multidata/{token}_multidata',
            '--savefile', f'multidata/{token}_multisave',
            '--location_check_points', str(check_points),
            '--hint_cost', str(hint_cost),
        ]
        if not allow_cheats:
            proc_args.append('--disable_item_cheat')

        # Store subprocess data in AginahBot instance dict
        ctx.bot.servers[token] = {
            'host': MULTIWORLD_HOST,
            'port': port,
            'proc': Popen(proc_args, stdin=PIPE, stdout=None, stderr=None)
        }
        print(f'Hosting multiworld server on port {port} with PID {ctx.bot.servers[token]["proc"].pid}.')

        # Send host details to client
        await ctx.send(f"Your game has been hosted:\nHost: `{MULTIWORLD_HOST}:{port}`\nToken: `{token}`")

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
            await ctx.send('It looks like a game with that token is already underway!')
            return

        # Check for presence of multidata file with given token
        if not os.path.exists(f'multidata/{token}_multidata'):
            await ctx.send('Sorry, no previous game with that token could be found.')
            return

        # Choose a port from 5000 to 7000 and ensure it is not in use
        while True:
            port = randrange(5000, 7000)
            if not self.is_port_in_use(port):
                break

        # Spawn a new subprocess hosting the game
        proc_args = [
            'python', BERSERKER_PATH,
            '--port', str(port),
            '--multidata', f'multidata/{token}_multidata',
            '--savefile', f'multidata/{token}_multisave',
            '--location_check_points', str(check_points),
            '--hint_cost', str(hint_cost),
        ]
        if not allow_cheats:
            proc_args.append('--disable_item_cheat')

        if os.path.exists(f'multidata/{token}_multisave'):
            proc_args.append('--savefile')
            proc_args.append(f'multidata/{token}_multisave')

        ctx.bot.servers[token] = {
            'host': MULTIWORLD_HOST,
            'port': port,
            'proc': Popen(proc_args, stdin=PIPE, stdout=None, stderr=DEVNULL)
        }
        print(f'Hosting multiworld server on port {port} with PID {ctx.bot.servers[token]["proc"].pid}.')

        # Send host details to client
        await ctx.send(f"Your game has been hosted:\nHost: `{MULTIWORLD_HOST}:{port}`\nToken: `{token}`")
        pass

    @commands.command(
        name='send-command',
        brief='Send a command to an in-progress multiworld game',
        help='Send a console command to an in-progress multiworld game.\n'
             'Usage: !aginah send-command {token} {command}',
    )
    async def send_command(self, ctx: commands.Context):
        # Parse token and command
        matches = findall("^\!aginah send-command ([A-z]{4}) (.*)$", ctx.message.content)
        if not len(matches) == 1:
            await ctx.send("Your command doesn't look right. Use `!aginah help send-command` for more info.")
            return

        # Assign arguments to variables, enforce token formatting
        token = str(matches[0][0]).upper()
        command = str(matches[0][1])

        # Ensure token exists among running games
        if token not in ctx.bot.servers:
            await ctx.send("No game with that token is currently running.")
            return

        # Send client message to the process via stdin
        # TODO: Figure out how to make the command actually stick
        # TODO: Purify this input!
        ctx.bot.servers[token]['proc'].communicate(f"{command}\n".encode('utf-8'))
        await ctx.send("Okay, message is sent.")

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

        # Kill the server process if it exists
        if token in ctx.bot.servers:
            ctx.bot.servers[token]['proc'].kill()
            del ctx.bot.servers[token]

            # Delete the multidata file
            if os.path.exists(f'multidata/{token}_multidata'):
                os.remove(f'multidata/{token}_multidata')

            # If there is a multisave, delete that too
            if os.path.exists(f'multidata/{token}_multisave'):
                os.remove(f'multidata/{token}_multisave')

            await ctx.send("The game has been ended.")

        else:
            # Warn the user if the provided token does not match a currently running game
            await ctx.send(f"No currently running game exists with the token {token}")

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
