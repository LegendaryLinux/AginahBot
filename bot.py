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

# Load commands and event responses from Cogs
aginahBot.load_extension("Cogs.Amusing")
aginahBot.load_extension("Cogs.Casual")
aginahBot.load_extension("Cogs.Racing")
aginahBot.load_extension("Cogs.Randomizer")
aginahBot.load_extension("Cogs.ErrorHandler")

# Run the bot
aginahBot.run(AGINAHBOT_TOKEN)
