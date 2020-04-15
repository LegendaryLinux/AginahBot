import asyncio
from discord.ext import commands
from re import findall

# Skip Berserker's automatically attempting to install requirements from a file
from ..MultiWorldUtilities import ModuleUpdate
ModuleUpdate.update_ran = True

# Import Berserker's MultiServer file
from ..MultiWorldUtilities.MultiClient import ReceivedItem
from ..MultiWorldUtilities import MultiServer
from ..MultiWorldUtilities import Items


class MultiworldCommands(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='notify',
        brief='Send a message to all players',
        help='Send a message to all players of a multiworld game.\n'
             'Usage: !aginah notify {token} {message}',
    )
    async def notify(self, ctx: commands.Context):
        result = findall("^!aginah notify ([A-z]{4}) (.*)$", ctx.message.content)
        if not result or len(result) == 0:
            await ctx.send("That command doesn't look right. Use `!aginah help notify` for more info.")
            return

        # Parse command args
        token, message = result[0]

        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        # Broadcast the message to all players
        MultiServer.notify_all(ctx.bot.servers[token]['game'], f"[NOTIFY ALL]: {message}")
        await ctx.send("Message sent.")

    @commands.command(
        name='notify-team',
        brief='Send a message to all players on a team',
        help='Send a message to all players on a specified team in a multiworld game.\n'
             'Usage: !aginah notify-team {token} {team-number} {message}',
    )
    async def notify_team(self, ctx: commands.Context):
        result = findall("^!aginah notify-team ([A-z]{4}) ([0-9]]*) (.*)$", ctx.message.content)
        if not result or len(result) == 0:
            await ctx.send("That command doesn't look right. Use `!aginah help notify-team` for more info.")
            return

        # Parse command args
        token, team, message = result[0]

        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        # Broadcast the message to all players on the team
        MultiServer.notify_team(ctx.bot.servers[token]['game'], int(team)-1, f"[NOTIFY_TEAM]: {message}")
        await ctx.send("Message sent.")

    @commands.command(
        name='notify-player',
        brief='Send a message to a player',
        help='Send a message to a specified player in a multiworld game.\n'
             'Usage: !aginah notify-player {token} {player} {message}',
    )
    async def notify_player(self, ctx: commands.Context):
        result = findall("^!aginah notify-player ([A-z]{4}) ([A-z0-9_-]*) (.*)$", ctx.message.content)
        if not result or len(result) == 0:
            await ctx.send("That command doesn't look right. Use `!aginah help notify-player` for more info.")
            return

        # Parse command args
        token, player, message = result[0]

        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        target_client = None
        for client in ctx.bot.servers[token]["game"].clients:
            if str(client.name).lower() == str(player).lower():
                target_client = client
                break

        if not target_client:
            await ctx.send("No matching player found.")
            return

        # Broadcast the message to all players on the team
        MultiServer.notify_client(target_client, f"[NOTIFY_PLAYER]: {message}")
        await ctx.send("Message sent.")
        
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
        name='forfeit',
        brief='Forfeit a player from a multiworld game',
        help='Forfeit a player from a multiworld game. This sends all items in their seed to the remaining players.\n'
             'Usage: !aginah forfeit-player {token} {player-name}',
    )
    async def forfeit(self, ctx: commands.Context):
        # Parse command arguments
        cmd_args = ctx.message.content.split()
        token = cmd_args[2] if 0 <= 2 < len(cmd_args) else None
        player = cmd_args[3] if 0 <= 3 < len(cmd_args) else None

        if not token:
            await ctx.send("You forgot to specify a game token. Use `!aginah help forfeit-player` for more info.")
            return

        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        if not player:
            await ctx.send("You must specify a player to forfeit. Use `!aginah help forfeit-player` for more info.")
            return

        target_client = None
        for client in ctx.bot.servers[token]["game"].clients:
            if str(client.name).lower() == str(player).lower():
                target_client = client
                break

        if not target_client:
            await ctx.send("No matching player found.")
            return

        MultiServer.forfeit_player(ctx.bot.servers[token]['game'], target_client.team, target_client.slot)
        await ctx.send(f"{target_client.name} has been forfeited.")

    @commands.command(
        name='kick-player',
        brief='Kick a player from a game',
        help='Kick a player from a multiworld game\n'
             'Usage: !aginah kick-player {token} {player-name}',
    )
    async def kick_player(self, ctx: commands.Context):
        result = findall("^!aginah kick-player ([A-z]{4}) ([A-z0-9_-]*)$", ctx.message.content)

        if not result or len(result) == 0:
            await ctx.send("That command doesn't look right. Use `!aginah help kick_player` for more info.")
            return

        # Parse command arguments
        token, player = result[0]

        if not token:
            await ctx.send("You forgot to specify a game token. Use `!aginah help kick_player` for more info.")
            return

        # Enforce token formatting
        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        target_client = None
        for client in ctx.bot.servers[token]["game"].clients:
            if str(client.name).lower() == str(player).lower():
                target_client = client
                break

        if not target_client:
            await ctx.send("No player with that name could be found.")
            return

        if not target_client.socket or target_client.socket.closed:
            await ctx.send("That played doesn't seem to be connected.")
            return

        await target_client.socket.close()
        await ctx.send("Player kicked.")

    @commands.command(
        name='send-item',
        brief='Give an item to a player',
        help='Give an item to a player in a multiworld game.\n'
             'Usage: !aginah send-item {token} {player-name} {item}',
    )
    async def send_item(self, ctx: commands.Context):
        result = findall("^!aginah send-item ([A-z]{4}) ([A-z0-9_-]*) (.*)$", ctx.message.content)

        if not result or len(result) == 0:
            await ctx.send("That command doesn't look right. Use `!aginah help send-item` for more info.")
            return

        # Parse command arguments
        token, player, item = result[0]

        if not token:
            await ctx.send("You forgot to specify a game token. Use `!aginah help show-players` for more info.")
            return

        # Enforce token formatting
        token = str(token).upper()
        if token not in ctx.bot.servers:
            await ctx.send("There is no running game with that token!")
            return

        target_client = None
        for client in ctx.bot.servers[token]["game"].clients:
            if str(client.name).lower() == str(player).lower():
                target_client = client
                break

        if not target_client:
            await ctx.send("No matching player found.")
            return

        # Figure out which item to send
        item_name, valid_item, response = MultiServer.get_intended_text(item, Items.item_table.keys())

        # If the item is invalid, inform the user to try again
        if not valid_item:
            await ctx.send(response)
            return

        # Send the item to the specified player
        new_item = ReceivedItem(Items.item_table[item_name][3], -1, target_client.slot)
        MultiServer.get_received_items(ctx.bot.servers[token]['game'],
                                       target_client.team, target_client.slot).append(new_item)
        notification = f"Admin Console: Sending {item_name} to {target_client.name} on Team {int(target_client.team)+1}"
        MultiServer.notify_all(ctx.bot.servers[token]['game'], notification)
        MultiServer.send_new_items(ctx.bot.servers[token]['game'])
        await ctx.send(f"Sending {item_name} to {target_client.name}.")

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
