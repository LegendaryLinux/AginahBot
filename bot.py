import os
from discord.ext import commands
from dotenv import load_dotenv

# Import commands
from Commands import Amusing

# Load environment variables
load_dotenv()
AGINAHBOT_TOKEN = os.getenv('AGINAHBOT_TOKEN')

aginahBot = commands.Bot(command_prefix='!aginah ')


@aginahBot.event
async def on_ready():
    # Notify of ready state
    print(f'{aginahBot.user} has connected to Discord and has joined {len(aginahBot.guilds)} server(s).')


@aginahBot.command(name='hello', help="Say hi to Aginah!")
async def do_be_crotchety(ctx):
    await Amusing.Commands.be_crotchety(ctx, aginahBot)


@aginahBot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.errors.CheckFailure):
        await ctx.send("You're not allowed to do that! (Missing role)")


aginahBot.run(AGINAHBOT_TOKEN)
