import asyncio
from discord.ext import commands

# Skip Berserker's automatically attempting to install requirements from a file
import ModuleUpdate
ModuleUpdate.update_ran = True

# Import Berserker's MultiServer file
import MultiServer


class Multiworld(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='broadcast',
        brief='Broadcast a message to all players.',
        help='Broadcast a message to all players of a multiworld game.\n'
             'Usage: !aginah broadcast {token} {message}',
    )
    async def broadcast(self, ctx: commands.Context):
        pass

    @commands.command(
        name='countdown',
        brief='Broadcast a countdown to all connected players.',
        help='Broadcast a countdown to all players of a multiworld game.\n'
             'Usage: !aginah countdown {token} {seconds=10}',
    )
    async def countdown(self, ctx: commands.Context):
        # Parse command arguments
        cmd_args = ctx.message.content.split()
        token = cmd_args[2] if 0 <= 2 < len(cmd_args) else None
        seconds = cmd_args[3] if 0 <= 3 < len(cmd_args) else 10

        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        # Run the countdown timer
        asyncio.create_task(MultiServer.countdown(ctx, seconds))

    @commands.command(
        name='forfeit-player',
        brief='Forfeit a player from a multiworld game',
        help='Forfeit a player from a multiworld game. This sends all items in their seed to the remaining players.\n'
             'Usage: !aginah forfeit-player {token} {player} {team=1}',
    )
    async def forfeit_player(self, ctx: commands.Context):
        pass

    @commands.command(
        name='give-item',
        brief='Give an item to a player in a multiworld game',
        help='Give an item to a player in a multiworld game.\n'
             'Usage: !aginah give-item {token} {player} {item} {team=1}',
    )
    async def give_item(self, ctx: commands.Context):
        pass

    @commands.command(
        name='show-players',
        brief='Show a list of all players connected to a multiworld game.',
        help='Show a list of all players connected to a multiworld game\n'
             'Usage: !aginah show-players {token}',
    )
    async def show_players(self, ctx: commands.Context):
        pass


def setup(bot: commands.Bot):
    bot.add_cog(Multiworld(bot))
