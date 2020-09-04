import os
import sqlite3
from discord.ext import commands
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
AGINAHBOT_TOKEN = os.getenv('AGINAHBOT_TOKEN')
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME')

# Create a (or connect to) a local sqlite database
db = sqlite3.connect(SQLITE_DB_NAME)
dbc = db.cursor()
dbc.execute('CREATE TABLE IF NOT EXISTS races ('
            'id integer not null primary key autoincrement,'
            'guildId varchar(128) not null,'
            'race_number integer not null'
            ')'
            )
dbc.execute('CREATE TABLE IF NOT EXISTS casuals ('
            'id integer not null primary key autoincrement,'
            'guildId varchar(128) not null,'
            'game_number integer not null'
            ')')
dbc.execute('CREATE TABLE IF NOT EXISTS role_categories ('
            'id integer not null primary key autoincrement,'
            'guildId varchar(128) not null,'
            'category varchar(128) not null,'
            'messageId varchar(128) not null'
            ')')
dbc.execute('CREATE TABLE IF NOT EXISTS roles ('
            'id integer not null primary key autoincrement,'
            'categoryId int not null,'
            'role varchar(100) not null,'
            'reaction varchar(128) not null,'
            'description varchar(256)'
            ')')

# Instantiate bot
aginahBot = commands.Bot(command_prefix='!aginah ')
aginahBot.db = db
aginahBot.dbc = dbc


@aginahBot.event
async def on_ready():
    # Notify of ready state
    print(f'{aginahBot.user} has connected to Discord and joined {len(aginahBot.guilds)} server(s).')

# Load commands and event responses from Cogs
aginahBot.load_extension("Cogs.Casual")
aginahBot.load_extension("Cogs.Racing")
aginahBot.load_extension("Cogs.HelpfulMessages")
aginahBot.load_extension("Cogs.MessageScanner")
aginahBot.load_extension("Cogs.RoleRequestor")
aginahBot.load_extension("Cogs.Scheduling")
aginahBot.load_extension("Cogs.ErrorHandler")

# Run the bot
aginahBot.run(AGINAHBOT_TOKEN)
