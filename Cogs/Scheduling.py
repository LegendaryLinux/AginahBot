import discord
import datetime
import re
from discord.ext import commands

REACTION_CONFIRM = '⚔'
REACTION_UNSURE = '🐔'

timezones = {
    # ZONE: (UTC hour offset, UTC minute offset)
    "ACDT": (10, 30),
    "ACST": (9, 30),
    "ACT": (-5, 0),
    "ACWST": (8, 45),
    "ADT": (-3, 0),
    "AEDT": (11, 0),
    "AEST": (10, 0),
    "AET": (10, 0),
    "AFT": (4, 30),
    "AKDT": (-8, 0),
    "AKST": (-9, 0),
    "ALMT": (6, 0),
    "AMST": (-3, 0),
    "AMT": (-4, 0),
    "ANAT": (12, 0),
    "AQTT": (5, 0),
    "ART": (-3, 0),
    "AST": (3, 0),
    "AWST": (8, 0),
    "AZOST": (0, 0),
    "AZOT": (-1, 0),
    "AZT": (4, 0),
    "BDT": (8, 0),
    "BIOT": (6, 0),
    "BIT": (-12, 0),
    "BOT": (-4, 0),
    "BRST": (-2, 0),
    "BRT": (-3, 0),
    "BTT": (6, 0),
    "CAT": (2, 0),
    "CCT": (6, 30),
    "CDT": (-5, 0),
    "CEST": (2, 0),
    "CET": (1, 0),
    "CHADT": (13, 45),
    "CHAST": (12, 45),
    "CHOT": (8, 0),
    "CHOST": (9, 0),
    "CHST": (10, 0),
    "CHUT": (10, 0),
    "CIST": (-8, 0),
    "CIT": (8, 0),
    "CKT": (-10, 0),
    "CLST": (-3, 0),
    "CLT": (-4, 0),
    "COST": (-4, 0),
    "COT": (-5, 0),
    "CST": (-6, 0),
    "CT": (8, 0),
    "CVT": (-1, 0),
    "CWST": (8, 45),
    "CXT": (7, 0),
    "DAVT": (7, 0),
    "DDUT": (10, 0),
    "DFT": (1, 0),
    "EASST": (-5, 0),
    "EAST": (-6, 0),
    "EAT": (3, 0),
    "ECT": (-4, 0),
    "EDT": (-4, 0),
    "EEST": (3, 0),
    "EET": (2, 0),
    "EGST": (0, 0),
    "EGT": (-1, 0),
    "EIT": (9, 0),
    "EST": (-5, 0),
    "FET": (3, 0),
    "FJT": (12, 0),
    "FKST": (-3, 0),
    "FKT": (-4, 0),
    "FNT": (-2, 0),
    "GALT": (-6, 0),
    "GAMT": (-9, 0),
    "GET": (4, 0),
    "GFT": (-3, 0),
    "GILT": (12, 0),
    "GIT": (-9, 0),
    "GMT": (0, 0),
    "GST": (-2, 0),
    "GYT": (-4, 0),
    "HDT": (-9, 0),
    "HAEC": (2, 0),
    "HST": (-10, 0),
    "HKT": (8, 0),
    "HMT": (5, 0),
    "HOVST": (8, 0),
    "HOVT": (7, 0),
    "ICT": (7, 0),
    "IDLW": (-12, 0),
    "IDT": (3, 0),
    "IOT": (3, 0),
    "IRDT": (4, 30),
    "IRKT": (8, 0),
    "IRST": (3, 30),
    "IST": (5, 30),
    "JST": (9, 0),
    "KALT": (2, 0),
    "KGT": (6, 0),
    "KOST": (11, 0),
    "KRAT": (7, 0),
    "KST": (9, 0),
    "LHST": (10, 30),
    "LINT": (14, 0),
    "MAGT": (12, 0),
    "MART": (-9, 30),
    "MAWT": (5, 0),
    "MDT": (-6, 0),
    "MET": (1, 0),
    "MEST": (2, 0),
    "MHT": (12, 0),
    "MIST": (11, 0),
    "MIT": (-9, 30),
    "MMT": (6, 30),
    "MSK": (3, 0),
    "MST": (-7, 0),
    "MUT": (4, 0),
    "MVT": (5, 0),
    "MYT": (8, 0),
    "NCT": (11, 0),
    "NDT": (-2, 30),
    "NFT": (11, 0),
    "NOVT": (7, 0),
    "NPT": (5, 45),
    "NST": (-3, 30),
    "NT": (-3, 30),
    "NUT": (-11, 0),
    "NZDT": (13, 0),
    "NZST": (12, 0),
    "OMST": (6, 0),
    "ORAT": (5, 0),
    "PDT": (-7, 0),
    "PET": (-5, 0),
    "PETT": (12, 0),
    "PGT": (10, 0),
    "PHOT": (13, 0),
    "PHT": (8, 0),
    "PKT": (5, 0),
    "PMDT": (-2, 0),
    "PMST": (-3, 0),
    "PONT": (11, 0),
    "PST": (-8, 0),
    "PYST": (-3, 0),
    "PYT": (-4, 0),
    "RET": (4, 0),
    "ROTT": (-3, 0),
    "SAKT": (11, 0),
    "SAMT": (4, 0),
    "SAST": (2, 0),
    "SBT": (11, 0),
    "SCT": (4, 0),
    "SDT": (-10, 0),
    "SGT": (8, 0),
    "SLST": (5, 30),
    "SRET": (11, 0),
    "SRT": (-3, 0),
    "SST": (8, 0),
    "SYOT": (3, 0),
    "TAHT": (-10, 0),
    "THA": (7, 0),
    "TFT": (5, 0),
    "TJT": (5, 0),
    "TKT": (13, 0),
    "TLT": (9, 0),
    "TMT": (5, 0),
    "TRT": (3, 0),
    "TOT": (13, 0),
    "TVT": (12, 0),
    "ULAST": (9, 0),
    "ULAT": (8, 0),
    "UTC": (0, 0),
    "UYST": (-2, 0),
    "UYT": (-3, 0),
    "UZT": (5, 0),
    "VET": (-4, 0),
    "VLAT": (10, 0),
    "VOLT": (4, 0),
    "VOST": (6, 0),
    "VUT": (11, 0),
    "WAKT": (12, 0),
    "WAST": (2, 0),
    "WAT": (1, 0),
    "WEST": (1, 0),
    "WET": (0, 0),
    "WIT": (7, 0),
    "WGST": (-2, 0),
    "WGT": (-3, 0),
    "WST": (8, 0),
    "YAKT": (9, 0),
    "YEKT": (5, 0)
}


def friendly_number(number: int):
    return f'0{number}' if number < 10 else number


class Scheduling(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(
        name='schedule',
        brief="Schedule a MultiWorld game",
        help="Schedule a MultiWorld game. Allowed times look like:\n\n"
             "X:00: Schedule a game for the next occurrence of the provided minutes value\n\n"
             "14:00 EST: Schedule a game for the next occurrence of the provided time and timezone. Users subject "
             "to daylight savings time, be aware you may have two different timezones. EST / EDT, for example.\n\n"
             "01/01/2020 07:00 GMT: Schedule a game for the specific provided time.\n\n"
             "Usage: !aginah schedule role [time]"
    )
    async def schedule(self, ctx: commands.Context):
        args = ctx.message.content.split(' ')
        if len(args) < 4:
            await ctx.send("Did you forget to provide a role or time?")
            return

        if re.search('^<.*>$', args[2]):
            role = role_mention = args[2]
        else:
            role = discord.utils.get(ctx.guild.roles, name=args[2])
            if role:
                if not role.mentionable:
                    await ctx.send("You don't have permission to ping that role.")
                    return
                else:
                    role_mention = role.mention
            else:
                await ctx.send(f"The role you wanted to ping ({args[2]}) doesn't exist on this server.")
                return

        time_str = (' '.join(args[3:])).lower()
        current_time = datetime.datetime.now(datetime.timezone(datetime.timedelta()))

        if re.search(r'\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{1,2} [A-z]*', time_str):
            dt_parts = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4}) (\d{1,2}):(\d{1,2}) ([A-z]*)', time_str)
            if dt_parts[6].upper() not in timezones:
                await ctx.send(f"I'm not familiar with the {dt_parts[6].upper()} timezone.")
                return

            target_time = datetime.datetime(int(dt_parts[3]), int(dt_parts[1]), int(dt_parts[2]),
                                            int(dt_parts[4]), int(dt_parts[5]), 0, 0,
                                            datetime.timezone(datetime.timedelta(0, 0, 0, 0,
                                                                                 timezones[dt_parts[6].upper()][1],
                                                                                 timezones[dt_parts[6].upper()][0])))
            if target_time.timestamp() < current_time.timestamp():
                await ctx.send("You can't schedule a game in the past!")
                return

            msg = await ctx.send(f'Attention {role_mention}:\n'
                                 f'{ctx.message.author.mention} wants to schedule a game to occur on: '
                                 f'{dt_parts[1]}/{dt_parts[2]}/{dt_parts[3]} '
                                 f'at {int(dt_parts[4])}:{friendly_number(int(dt_parts[5]))} '
                                 f'{dt_parts[6].upper()}.\n'
                                 f'React with {REACTION_CONFIRM} If you intend to join this game.\n'
                                 f'React with {REACTION_UNSURE} If you don\'t know yet.')
            await msg.add_reaction(REACTION_CONFIRM)
            await msg.add_reaction(REACTION_UNSURE)
            await ctx.message.delete()
            return

        if re.search(r'\d{1,2}:\d{1,2} [A-z]*', time_str):
            dt_parts = re.match(r'(\d{1,2}):(\d{1,2}) ([A-z]*)', time_str)
            if dt_parts[3].upper() not in timezones:
                await ctx.send(f"I'm not familiar with the {dt_parts[3].upper()} timezone.")
                return

            target_time = datetime.datetime(current_time.year, current_time.month, current_time.day,
                                            int(dt_parts[1]), int(dt_parts[2]), 0, 0,
                                            datetime.timezone(datetime.timedelta(0, 0, 0, 0,
                                                                                 timezones[dt_parts[3].upper()][1],
                                                                                 timezones[dt_parts[3].upper()][0]))
                                            )

            if target_time.timestamp() < current_time.timestamp():
                target_time = target_time + datetime.timedelta(days=1)

            msg = await ctx.send(f'Attention {role_mention}:\n'
                                 f'{ctx.message.author.mention} wants to schedule a game to occur on: '
                                 f'{target_time.month}/{target_time.day}/{target_time.year} '
                                 f'at {target_time.hour}:{friendly_number(target_time.minute)} '
                                 f'{dt_parts[3].upper()}.\n'
                                 f'React with {REACTION_CONFIRM} If you intend to join this game.\n'
                                 f'React with {REACTION_UNSURE} If you don\'t know yet.')
            await msg.add_reaction(REACTION_CONFIRM)
            await msg.add_reaction(REACTION_UNSURE)
            await ctx.message.delete()
            return

        if re.search(r'x{1,2}:\d{1,2}', time_str):
            dt_parts = re.match(r'x{1,2}:(\d{1,2})', time_str)
            target_time = datetime.datetime(current_time.year, current_time.month, current_time.day, 0,
                                            int(dt_parts[1]), 0, 0, datetime.timezone(datetime.timedelta()))

            if target_time.timestamp() < current_time.timestamp():
                target_time = target_time + datetime.timedelta(hours=1)

            msg = await ctx.send(f'Attention {role_mention}:\n'
                                 f'{ctx.message.author.mention} wants to schedule a game to occur on: '
                                 f'{target_time.month}/{target_time.day}/{target_time.year} '
                                 f'at {target_time.hour}:{friendly_number(target_time.minute)} UTC.\n'
                                 f'React with {REACTION_CONFIRM} If you intend to join this game.\n'
                                 f'React with {REACTION_UNSURE} If you don\'t know yet.')
            await msg.add_reaction(REACTION_CONFIRM)
            await msg.add_reaction(REACTION_UNSURE)
            await ctx.message.delete()
            return

        await ctx.send("Sorry, I don't understand that time. Use `!aginah help schedule` for more info.")


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Scheduling(bot))
