import os
import sqlite3
import multiprocessing
from discord.ext import commands
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
AGINAHBOT_TOKEN = os.getenv('AGINAHBOT_TOKEN')
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')

# All subprocesses should be initialized using the spawn method
multiprocessing.set_start_method('spawn', force=True)

# Create a (or connect to) a local sqlite database
db = sqlite3.connect(SQLITE_DB_NAME)
dbc = db.cursor()
dbc.execute('CREATE TABLE IF NOT EXISTS races ('
            'id integer not null primary key autoincrement,'
            'guild varchar(128) not null,'
            'race_number integer not null'
            ')'
            )
dbc.execute('CREATE TABLE IF NOT EXISTS casuals ('
            'id integer not null primary key autoincrement,'
            'guild varchar(128) not null,'
            'game_number integer not null'
            ')')

# Instantiate bot
aginahBot = commands.Bot(command_prefix='!aginah ')

# Store multiworld server data in memory
aginahBot.servers = {}


@aginahBot.event
async def on_ready():
    # Notify of ready state
    print(f'{aginahBot.user} has connected to Discord and joined {len(aginahBot.guilds)} server(s).')

# Load commands and event responses from Cogs
aginahBot.load_extension("Cogs.Casual")
aginahBot.load_extension("Cogs.Racing")
aginahBot.load_extension("Cogs.Multiworld")
aginahBot.load_extension("Cogs.MultiworldCommands")
aginahBot.load_extension("Cogs.ErrorHandler")

# Run the bot
aginahBot.run(AGINAHBOT_TOKEN)