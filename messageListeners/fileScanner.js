const {generalErrorHandler} = require('../errorHandlers');
const https = require('https');
const tmp = require('tmp');
const fs = require('fs');
const unZipper = require('unzipper');
const unrar = require('unrar');
const tar = require('tar');
const sevenZip = require('node-7z');

const romExtensions = ['sfc', 'smc', 'rom', 'nes', 'z64', 'n64'];
const archiveExtensions = ['zip', 'rar', 'tar', 'gz', '7z'];

const isRomFile = (filename) => {
  const parts = filename.split('.');
  for (const part of parts) {
    // Rom extension is present in filename
    if (romExtensions.indexOf(part) !== -1) { return true; }
  }
  // Doesn't look like a ROM file
  return false;
}

const isArchiveFile = (filename) => {
  const parts = filename.split('.');
  for (const part of parts) {
    // Archive extension is present in filename
    if (archiveExtensions.indexOf(part) !== -1) { return true; }
  }
  // Doesn't look like an archive file
  return false;
}

const deleteRomFile = (message) => {
  message.channel.send(`${message.author}: Do not post links to ROMs or other copyrighted content.`);
  return message.delete();
};

module.exports = (client, message) => {
  try{
    return message.attachments.each((attachment) => {
      // Disallow direct posting of ROM files
      if (isRomFile(attachment.name)) {
        deleteRomFile(message);
      }

      if (isArchiveFile(attachment.name)) {
        // Download the file so it can be locally analyzed
        return https.get(attachment.url, (response) => {
          if (response.statusCode !== 200) {
            message.channel.send(`${message.author}: Unable to retrieve attachment for analysis. ` +
              `Your message has been deleted.`);
            message.delete();
            return;
          }

          const tempFile = tmp.fileSync({ postfix: '.aginah', discardDescriptor: true });
          const writeStream = fs.createWriteStream(tempFile.name);
          response.pipe(writeStream);
          writeStream.on('finish', () => {
            writeStream.close(() => {
              const fileExt = attachment.name.split('.').pop();
              let fileDeleted = false;
              switch (fileExt) {
                case 'zip':
                  return fs.createReadStream(tempFile.name).pipe(unZipper.Parse())
                    .on('entry', (file) => {
                      if (isRomFile(file.path) && !fileDeleted) {
                        fileDeleted = true;
                        return deleteRomFile(message);
                      }
                    })

                case 'rar':
                  return new unrar(tempFile.name,['n']).list((err, files) => {
                    if (err) {
                      console.error(err);
                      message.channel.send(`${message.author}: Unable to extract file for ` +
                        "analysis. It has been deleted.");
                      return message.delete();
                    }
                    files.forEach((file) => {
                      if (fileDeleted) { return; }
                      if (isRomFile(file.name)) {
                        fileDeleted = true;
                        deleteRomFile(message);
                      }
                    });
                  });

                case 'tar':
                  return tar.list({
                    file: tempFile.name,
                    onentry: (entry) => {
                      if (isRomFile(entry.header.path) && !fileDeleted) {
                        fileDeleted = true;
                        deleteRomFile(message);
                      }
                    },
                  })

                case 'gz':
                  message.channel.send(`${message.author}: Gzipped files are unsupported. ` +
                    `Your message has been deleted.`);
                  return message.delete();

                case '7z':
                  const contents = sevenZip.list(tempFile.name, {
                    $bin: require('7zip-bin').path7za,
                  });
                  return contents.on('data', (data) => {
                    if (isRomFile(data.file) && !fileDeleted) {
                      fileDeleted = true;
                      deleteRomFile(message);
                    }
                  });
              }
            });

            // Retain files for one hour, then delete them.
            setTimeout(() => {
              fs.unlink(tempFile.name, (error) => {if (error) generalErrorHandler(error)});
            }, 300 * 1000);
          });

        }).on('error', (e) => {
          message.channel.send(`${message.author}: Unable to retrieve attachment for analysis. ` +
            `Your message has been deleted.`);
          message.delete();
          console.error(e);
        });
      }
    });
  } catch (error) {
    message.channel.send("Something went wrong while trying to analyze your file. It has been deleted " +
      "for safety purposes.");
    message.delete();
    generalErrorHandler(error);
  }
};