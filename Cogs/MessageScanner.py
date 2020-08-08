from discord.ext import commands
import zipfile
import py7zr
import rarfile
import tarfile


def is_valid_archive_content_filename(fname: str):
    invalid_content_extensions = ['sfc', 'smc', '.rom', 'zip', 'rar', 'tar', 'gz', '7z']
    if '.' not in fname:
        return False
    for part in fname.split('.'):
        if part.lower() in invalid_content_extensions:
            return False
    return True


class MessageScanner(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        try:
            rom_extensions = ['.sfc', '.smc', '.rom']
            # Disallow uploads containing ROM files
            for attachment in message.attachments:
                if '.' not in attachment.filename:
                    await message.delete()
                    await message.channel.send("That file looked spooky. I'm not okay with it.")
                    return

                if attachment.filename[-4:] in rom_extensions:
                    await message.delete()
                    await message.channel.send(
                        f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                    return

                # Zip file handling
                if attachment.filename[-4:].lower() == '.zip' or zipfile.is_zipfile(attachment.filename):
                    try:
                        file = zipfile.ZipFile((await attachment.to_file()).fp)

                        for info in file.infolist():
                            if info.flag_bits & 0x1:
                                await message.delete()
                                await message.channel.send("Encrypted files are not permitted.")
                                return

                        for filename in file.namelist():
                            if not is_valid_archive_content_filename(filename):
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
                            if not is_valid_archive_content_filename(filename):
                                await message.delete()
                                await message.channel.send(
                                    f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                                return
                    except AttributeError as ae:
                        if 'encode' in str(ae):
                            await message.delete()
                            await message.channel.send("Encrypted files are not permitted.")
                            return
                    except py7zr.Bad7zFile:
                        pass

                # .rar file handling
                if attachment.filename[-4:].lower() == '.rar':
                    try:
                        file = rarfile.RarFile((await attachment.to_file()).fp)
                        if file.needs_password():
                            await message.delete()
                            await message.channel.send("Encrypted files are not permitted.")
                            return
                        for filename in file.namelist():
                            if not is_valid_archive_content_filename(filename):
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
                            if not is_valid_archive_content_filename(filename):
                                await message.delete()
                                await message.channel.send(
                                    f'{message.author.mention} Do not post ROMS or other copyrighted material.')
                                return
                    except tarfile.ReadError:
                        pass

                # .gz file handling
                if attachment.filename[-7:].lower() != '.tar.gz' and attachment.filename[-3:].lower() == '.gz':
                    await message.delete()
                    await message.channel.send(
                        f'{message.author.mention} Sorry, `.gzip` files are prohibited.')
        except:
            # If something goes terribly wrong while scanning a file, delete it
            await message.delete()
            await message.channel.send("I couldn't scan that file. Better safe than sorry.")


# All cogs must have this function
def setup(bot: commands.Bot):
    bot.add_cog(MessageScanner(bot))
