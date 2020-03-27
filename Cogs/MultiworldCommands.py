import asyncio
from discord.ext import commands
from re import findall

# Skip Berserker's automatically attempting to install requirements from a file
import ModuleUpdate
ModuleUpdate.update_ran = True

# Import Berserker's MultiServer file
from MultiClient import ReceivedItem
import MultiServer
import Items


class MultiworldCommands(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='broadcast',
        brief='Broadcast a message to all players',
        help='Broadcast a message to all players of a multiworld game.\n'
             'Usage: !aginah broadcast {token} {message}',
    )
    async def broadcast(self, ctx: commands.Context):
        pass

    @commands.command(
        name='countdown',
        brief='Broadcast a countdown to all connected players',
        help='Broadcast a countdown to all players of a multiworld game.\n'
             'Usage: !aginah countdown {token} {seconds=10}',
    )
    async def countdown(self, ctx: commands.Context):
        # Parse command arguments
        cmd_args = ctx.message.content.split()
        token = cmd_args[2] if 0 <= 2 < len(cmd_args) else None
        seconds = cmd_args[3] if 0 <= 3 < len(cmd_args) else 10

        if not token:
            await ctx.send("You forgot to specify a game token. Use `!aginah help countdown` for more info.")
            return

        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        # Run the countdown timer
        asyncio.create_task(MultiServer.countdown(ctx.bot.servers[token]['game'], int(seconds)))

    @commands.command(
        name='forfeit-player',
        brief='Forfeit a player from a multiworld game',
        help='Forfeit a player from a multiworld game. This sends all items in their seed to the remaining players.\n'
             'Usage: !aginah forfeit-player {token} {player_number} {team_number=1}',
    )
    async def forfeit_player(self, ctx: commands.Context):
        # Parse command arguments
        cmd_args = ctx.message.content.split()
        token = cmd_args[2] if 0 <= 2 < len(cmd_args) else None
        player = cmd_args[3] if 0 <= 3 < len(cmd_args) else None
        team = cmd_args[4] if 0 <= 4 < len(cmd_args) else 1

        if not token:
            await ctx.send("You forgot to specify a game token. Use `!aginah help forfeit-player` for more info.")
            return

        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        if not player:
            await ctx.send("You must specify a player number to forfeit. "
                           "Use `!aginah help forfeit-player` for more info.")
            return

        try:
            # Forfeit the player
            # Why is team number 0-indexed, but player number is not?
            MultiServer.forfeit_player(ctx.bot.servers[token]['game'], int(team)-1, int(player))
        except KeyError:
            await ctx.send(f"There is no Player {player} on Team {team}. "
                           f"Are you sure that team number and player number exist?")
            return
        await ctx.send("Player has been forfeited.")

    @commands.command(
        name='give-item',
        brief='Give an item to a player',
        help='Give an item to a player in a multiworld game.\n'
             'Usage: !aginah give-item {token} {player} {team} {item}',
    )
    async def give_item(self, ctx: commands.Context):
        result = findall("^ \!aginah give-item ([A-z]{4}) (\d) (\d) (.*)$", ctx.message.content)

        if not result or len(result) == 0:
            await ctx.send("That command doesn't look right. Use `!aginah help give-item` for more info.")
            return

        # Parse command arguments
        token, player, team, item = result[0]

        if not token:
            await ctx.send("You forgot to specify a game token. Use `!aginah help show-players` for more info.")
            return

        # Enforce token formatting
        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        # Figure out which item to send
        item_name, valid_item, response = MultiServer.get_intended_text(item, Items.item_table.keys())

        # If the item is invalid, inform the user to try again
        if not valid_item:
            await ctx.send(response)
            return

        # Send the item to the specified player
        new_item = ReceivedItem(Items.item_table[item_name][3], -1, player)
        MultiServer.get_received_items(ctx.bot.servers[token]['game'], int(team)-1, int(player)).append(new_item)
        MultiServer.notify_all(ctx.bot.servers[token]['game'], f"Admin Console: Sending {item_name} to "
                                                               f"Player {player} on Team {team}")
        MultiServer.send_new_items(ctx.bot.servers[token]['game'])

    @commands.command(
        name='show-players',
        brief='Show a list of all connected players',
        help='Show a list of all players connected to a multiworld game.\n'
             'Usage: !aginah show-players {token}',
    )
    async def show_players(self, ctx: commands.Context):
        # Parse command arguments
        cmd_args = ctx.message.content.split()
        token = cmd_args[2] if 0 <= 2 < len(cmd_args) else None

        if not token:
            await ctx.send("You forgot to specify a game token. Use `!aginah help show-players` for more info.")
            return

        # Enforce token formatting
        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        await ctx.send(MultiServer.get_connected_players_string(ctx.bot.servers[token]['game']))


def setup(bot: commands.Bot):
    bot.add_cog(MultiworldCommands(bot))
