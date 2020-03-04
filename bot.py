import os
import sqlite3
from discord.ext import commands
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
AGINAHBOT_TOKEN = os.getenv('AGINAHBOT_TOKEN')
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')

# Instantiate bot
aginahBot = commands.Bot(command_prefix='!aginah ')


@aginahBot.event
async def on_ready():
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

    # Notify of ready state
    print(f'{aginahBot.user} has connected to Discord and has joined {len(aginahBot.guilds)} server(s).')


# Load commands and event responses from Cogs
aginahBot.load_extension("Cogs.Amusing")
aginahBot.load_extension("Cogs.Racing")
aginahBot.load_extension("Cogs.Randomizer")
aginahBot.load_extension("Cogs.ErrorHandler")

# Run the bot
aginahBot.run(AGINAHBOT_TOKEN)
