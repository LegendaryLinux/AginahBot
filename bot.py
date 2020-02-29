import os
from discord.ext import commands
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
AGINAHBOT_TOKEN = os.getenv('AGINAHBOT_TOKEN')

# Instantiate bot
aginahBot = commands.Bot(command_prefix='!aginah ')


@aginahBot.event
async def on_ready():
    # Notify of ready state
    print(f'{aginahBot.user} has connected to Discord and has joined {len(aginahBot.guilds)} server(s).')


@aginahBot.event
async def on_voice_state_update(member, before, after):
    if after.channel:
        print(f'{member.name} has connected to {after.channel}')
    else:
        print(f'{member.name} has disconnected from {before.channel}')

# Load commands and event responses from Cogs
aginahBot.load_extension("Cogs.Amusing")
aginahBot.load_extension("Cogs.ChannelControl")
aginahBot.load_extension("Cogs.Randomizer")


@aginahBot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.errors.CheckFailure):
        await ctx.send("You're not allowed to do that! (Missing role)")


aginahBot.run(AGINAHBOT_TOKEN)
