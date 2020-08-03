from discord.ext import commands
import zipfile
import py7zr
import rarfile
import tarfile
import gzip


class Scanner(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        # Disallow uploads containing ROM files
        for attachment in message.attachments:
            if (attachment.filename[-4:].lower() == '.sfc') or (attachment.filename[-4:].lower() == '.smc'):
                await message.delete()
                await message.channel.send(
                    f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                return

            # Zip file handling
            if attachment.filename[-4:].lower() == '.zip' or zipfile.is_zipfile(attachment.filename):
                try:
                    file = zipfile.ZipFile((await attachment.to_file()).fp)
                    for filename in file.namelist():
                        if filename[-4:].lower() == '.sfc' or filename[-4:].lower() == '.smc':
                            await message.delete()
                            await message.channel.send(
                                f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                            return
                except zipfile.BadZipFile:
                    pass

            # .7z file handling
            if attachment.filename[-3:].lower() == '.7z' or py7zr.is_7zfile(attachment.filename):
                try:
                    file = py7zr.SevenZipFile((await attachment.to_file()).fp)
                    for filename in file.getnames():
                        if filename[-4:].lower() == '.sfc' or filename[-4:].lower() == '.smc':
                            await message.delete()
                            await message.channel.send(
                                f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                            return
                except py7zr.Bad7zFile:
                    pass

            # .rar file handling
            if attachment.filename[-4:].lower() == '.rar':
                try:
                    file = rarfile.RarFile((await attachment.to_file()).fp)
                    for filename in file.namelist():
                        if filename[-4:].lower() == '.sfc' or filename[-4:].lower() == '.smc':
                            await message.delete()
                            await message.channel.send(
                                f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                            return
                except rarfile.BadRarFile:
                    pass

            # .tar file handling
            if attachment.filename[-4:].lower() == '.tar' or attachment.filename[-7:].lower() == '.tar.gz':
                try:
                    file = tarfile.open(None, 'r', (await attachment.to_file()).fp)
                    for filename in file.getnames():
                        if filename[-4:].lower() == '.sfc' or filename[-4:].lower() == '.smc':
                            await message.delete()
                            await message.channel.send(
                                f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                            return
                except tarfile.ReadError:
                    pass

            # .gz file handling
            if attachment.filename[-7:].lower() != '.tar.gz' and attachment.filename[-3:].lower() == '.gz':
                try:
                    await message.delete()
                    await message.channel.send(
                        f'{message.author.mention} Sorry, `.gzip` files are prohibited.')
                except gzip.BadGzipFile:
                    pass


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(Scanner(bot))
