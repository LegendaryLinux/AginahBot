import os
import aiohttp
import aiofiles
import socket
import string
import requests
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
             'Usage: !aginah host-berserker [check_points [hint_cost [allow_cheats]]]'
    )
    async def host_berserker(self, ctx: commands.Context):
        if not ctx.message.attachments:
            await ctx.send("Did you forget to attach a multidata file?")
            return

        # Parse command arguments from ctx
        cmd_args = ctx.message.content.split()
        check_points = cmd_args[2] if 2 in cmd_args else 1
        hint_cost = cmd_args[3] if 3 in cmd_args else 50
        allow_cheats = True if 4 in cmd_args else False

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
            '--location_check_points', str(check_points),
            '--hint_cost', str(hint_cost),
            '--disable_port_forward',
        ]
        if not allow_cheats:
            proc_args.append('--disable_item_cheat')

        # Store subprocess data in AginahBot instance dict
        ctx.bot.servers[token] = {
            'host': MULTIWORLD_HOST,
            'port': port,
            'proc': Popen(proc_args, stdin=PIPE, stdout=DEVNULL, stderr=DEVNULL)
        }
        print(f'Hosting multiworld server on port {port} with PID {ctx.bot.servers[token].proc.pid}.')

        # Send host details to client
        await ctx.send(f"Your game has been hosted:\nHost: `{MULTIWORLD_HOST}:{port}`\nToken: `{token}`")

    @commands.command(
        name='resume-game',
        brief='Re-host a game previously hosted by AginahBot',
        help='Re-host a timed-out or closed game previously hosted by AginahBot.\n'
             'Usage: !aginah resume-game {token} {check_points} {hint_cost} {allow_cheats}',
    )
    async def resume_game(self, ctx: commands.Context):
        # Parse command arguments from ctx
        cmd_args = ctx.message.content.split()
        token = cmd_args[2] if 2 in cmd_args else None
        check_points = cmd_args[3] if 3 in cmd_args else 1
        hint_cost = cmd_args[4] if 4 in cmd_args else 50
        allow_cheats = True if 5 in cmd_args else False

        # Ensure a token is provided
        if not token:
            await ctx.send('You forgot to give me a token! Use `!aginah help resume-game` for more details.')
            return

        # Ensure token is of correct length
        if len(token) != 4:
            await ctx.send("That token doesn't look right. Use `!aginah help resume-game` for more details.")
            return

        # Enforce token formatting
        token = str(token).capitalize()

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
            '--location_check_points', str(check_points),
            '--hint_cost', str(hint_cost),
            '--disable_port_forward',
        ]
        if not allow_cheats:
            proc_args.append('--disable_item_cheat')

        if os.path.exists(f'multidata/{token}_multisave'):
            proc_args.append('--savefile')
            proc_args.append(f'multidata/{token}_multisave')

        ctx.bot.servers[token] = {
            'host': MULTIWORLD_HOST,
            'port': port,
            'proc': Popen(proc_args, stdin=PIPE, stdout=DEVNULL, stderr=DEVNULL)
        }
        print(f'Hosting multiworld server on port {port} with PID {ctx.bot.servers[token].proc.pid}.')

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
        # TODO: Get existing process via token lookup

        # TODO: Send client message to the process via stdin
        await ctx.send('This command is currently under development. Complain to Farrak.')
        pass

    @commands.command(
        name='end-game',
        brief='Close a multiworld server',
        help='Shut down a multiworld server. Current players will be disconnected and new players will '
             'be unable to join.\n'
             'Usage: !aginah end-game {token}',
    )
    async def end_game(self, ctx: commands.Context):
        # Parse command arguments
        cmd_args = ctx.message.content.split()

        if cmd_args[2] in cmd_args:
            # Enforce token format
            token = str(cmd_args[2]).capitalize()

            # Kill the server process if it exists
            if token in ctx.bot.servers:
                ctx.bot.servers[token].proc.kill()
                del ctx.bot.servers[token]

                # Delete the multidata file
                if os.path.exists(f'multidata/{token}_multidata'):
                    os.remove(f'multidata/{token}_multidata')

                # If there is a multisave, delete that too
                if os.path.exists(f'multidata/{token}_multisave'):
                    os.remove(f'multidata/{token}_multisave')

            else:
                # Warn the user if the provided token does not match a currently running game
                await ctx.send(f"No currently running game exists with the token {token}")

            await ctx.send("The game has been ended.")

        else:
            await ctx.send("Did you forget to give a token?\nUse `!aginah help end-game` for more info.")

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
            token = findall("^([A-Z]{4})_(multiworld|multidata)$", file.name)
            # If a token match is found and a game with that token is not currently running, delete the file
            if token and token[0] not in ctx.bot.servers:
                os.remove(file.path)


def setup(bot: commands.Bot):
    bot.add_cog(Multiworld(bot))
