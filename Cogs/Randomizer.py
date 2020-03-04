from discord.ext import commands
import requests
import re


class Randomizer(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='host-game',
        brief="Use AginahBot to host your multiworld",
        help='Upload a .multidata file to have AginahBot host a multiworld game.\n'
             'Usage: !aginah host-game {check_points} {hint_cost} {allow_cheats}'
    )
    async def host_game(self, ctx: commands.Context):
        if not ctx.message.attachments:
            await ctx.send('You forgot to attach a multidata file! 🙄️')
            return

        # Send a request to the MultiWorldHostService
        args = ctx.message.content.split()
        post = requests.post('http://localhost:5000/game', json={
            'multidata_url': ctx.message.attachments[0].url,
            'checkValue': args[2] if len(args) > 3 else 1,
            'hintCost': args[3] if len(args) > 4 else 1000,
            'allowCheats': args[4] if len(args) > 5 else 0
        })

        if post.status_code == 200:
            response = post.json()
            await ctx.send(f"I'm now hosting your game. It will be automatically closed after 24 hours.\n"
                           f"Server: `{response['host']}:{response['port']}`\n"
                           f"Token: `{response['token']}`")
        else:
            await ctx.send("🔥Something broke!🔥 I couldn't host your game. Did you attach a multidata file?")
            return

    @commands.command(
        name='resume-game',
        brief='Re-host a game previously hosted by AginahBot',
        help='Re-host a timed-out or closed game previously hosted by AginahBot.\n'
             'Usage: !aginah resume-game {token} {check_points} {hint_cost} {allow_cheats}',
    )
    async def resume_game(self, ctx: commands.Context):
        args = ctx.message.content.split()

        if not args[2] or not len(args[2]) == 6:
            await ctx.send('You need to give me a token so I know which game to end. It should be six characters long.')
            return

        token = args[2]
        post = requests.post(f'http://localhost:5000/game/{token}', json={
            'checkValue': args[3] if len(args) > 4 else 1,
            'hintCost': args[4] if len(args) > 5 else 1000,
            'allowCheats': args[5] if len(args) > 6 else 0
        })
        response = post.json()

        if post.status_code != 200:
            await ctx.send("🔥Something broke!🔥 I wasn't able to host your game.")
            return

        await ctx.send(f"Your game has been resumed. It will be automatically closed after 24 hours.\n"
                       f"Server: `{response['host']}:{response['port']}`\n"
                       f"Token: `{response['token']}`")

    @commands.command(
        name='send-command',
        brief='Send a command to an in-progress multiworld game',
        help='Send a console command to an in-progress multiworld game.\n'
             'Usage: !aginah send-command {token} {command}',
    )
    async def send_command(self, ctx: commands.Context):
        args = ctx.message.content.split()

        # Check for valid token
        if not args[2] or len(args[2]) != 6:
            await ctx.send("Your token doesn't look right. Use `!aginah help send-command for more info`")
            return
        else:
            token = args[2]

        # Parse the command, which is everything after arg2
        cmd_parse = re.findall(f'.*{token}\W(.*)', ctx.message.content)
        if not cmd_parse[0]:
            await ctx.send("It looks like you forgot to enter a command. Use `!aginah help send-command` for more info")
            return

        put = requests.put(f'http://localhost:5000/game/{token}/msg', json={
            'msg': cmd_parse[0]
        })

        if put.status_code != 200:
            await ctx.send("🔥Something broke!🔥 I couldn't send your message.")
            return

        await ctx.send("Got it!")

    @commands.command(
        name='end-game',
        brief='Close a multiworld server',
        help='Shut down a multiworld server. Current players will be disconnected and new players will '
             'be unable to join.\n'
             'Usage: !aginah end-game {token}',
    )
    async def end_game(self, ctx: commands.Context):
        args = ctx.message.content.split()

        if not args[2] or not len(args[2]) == 6:
            await ctx.send("You need to give me a token so I know which game to end. See `!aginah end-game` for help.")
            return

        token = args[2]
        delete = requests.delete(f'http://localhost:5000/game/{token}')

        if delete.status_code == 404:
            await ctx.send("That game doesn't exist, or it's already closed.")
            return
        elif delete.status_code == 200:
            await ctx.send("The game has been closed.")
            return
        else:
            await ctx.send("🔥Something broke!🔥 I'm not sure if the game is closed or not.")


def setup(bot: commands.Bot):
    bot.add_cog(Randomizer(bot))
