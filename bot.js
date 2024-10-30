const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const DB_PATH = './file_database.json';
let db = new Map();

// Fungsi untuk memuat database dari file JSON
function loadDatabase() {
  if (fs.existsSync(DB_PATH)) {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    db = new Map(JSON.parse(data));
    console.log('[LOG] Database loaded successfully.');
  } else {
    console.log('[LOG] No existing database found, starting fresh.');
  }
}

// Fungsi untuk menyimpan database ke file JSON
function saveDatabase() {
  fs.writeFileSync(DB_PATH, JSON.stringify([...db]), 'utf-8');
  console.log('[LOG] Database saved.');
}

// Fungsi untuk menghasilkan UUID
function generateCustomId() {
  return uuidv4();
}

// Fungsi untuk URL publik file
function getPublicFileUrl(botUsername, fileId) {
  return `https://t.me/${botUsername}?start=${fileId}`;
}

// Mengecek tipe file yang didukung
function isSupportedFileType(ctx) {
  const fileMessage = ctx.message.reply_to_message || ctx.message;
  return !!(
    fileMessage.document ||
    fileMessage.photo ||
    fileMessage.video ||
    fileMessage.audio
  );
}

// Forward file ke channel database
async function forwardFileToDatabase(ctx, file, fileType, customId, username, uploadDate) {
  const forwardMessage = `📄 **File Uploaded**:\nUploader: ${username || ctx.from.id}\nFile ID: ${customId}\nUpload Date: ${uploadDate}\nPublic Link: ${getPublicFileUrl(bot.botInfo.username, customId)}`;

  try {
    if (fileType === 'document') {
      await ctx.telegram.sendDocument(CHANNEL_ID, file.file_id, { caption: forwardMessage });
    } else if (fileType === 'photo') {
      await ctx.telegram.sendPhoto(CHANNEL_ID, file.file_id, { caption: forwardMessage });
    } else if (fileType === 'video') {
      await ctx.telegram.sendVideo(CHANNEL_ID, file.file_id, { caption: forwardMessage });
    } else if (fileType === 'audio') {
      await ctx.telegram.sendAudio(CHANNEL_ID, file.file_id, { caption: forwardMessage });
    }
    console.log(`[LOG] File ${customId} forwarded to database channel.`);
  } catch (error) {
    console.log(`[ERROR] Failed to forward file ${customId} to channel: ${error.message}`);
  }
}

// Command /start untuk informasi dan daftar command
bot.command('start', (ctx) => {
  const fileId = ctx.message.text.split(' ')[1];
  if (fileId && db.has(fileId)) {
    const fileRecord = db.get(fileId);
    const { file_id, fileType, uploader, uploadDate } = fileRecord;
    const downloadCaption = `📥 **File Downloaded**:\n- File ID: ${fileId}\n- Uploaded by: ${uploader}\n- Upload Date: ${uploadDate}\n- Type: ${fileType}`;

    // Kirim detail dan file ke pengguna
    if (fileType === 'document') {
      ctx.telegram.sendDocument(ctx.chat.id, file_id, { caption: downloadCaption });
    } else if (fileType === 'photo') {
      ctx.telegram.sendPhoto(ctx.chat.id, file_id, { caption: downloadCaption });
    } else if (fileType === 'video') {
      ctx.telegram.sendVideo(ctx.chat.id, file_id, { caption: downloadCaption });
    } else if (fileType === 'audio') {
      ctx.telegram.sendAudio(ctx.chat.id, file_id, { caption: downloadCaption });
    }
  } else {
    const welcomeMessage = `Welcome to File Sharing Bot! Here are the available commands:
/upload - Upload a file
/download <file_id> - Download a file with the given ID
/delete <file_id> - Delete a file with the given ID
/list - View your uploaded files
${ctx.from.id === Number(OWNER_ID) ? "/listall - View all uploaded files" : ""}
Enjoy sharing files securely!`;

    ctx.reply(welcomeMessage);
  }
});

// Command upload
bot.command(['upload', 'up'], async (ctx) => {
  const message = ctx.message.reply_to_message || ctx.message;
  if (!isSupportedFileType({ message })) {
    return ctx.reply("❌ Unsupported file type. Please upload a document, photo, video, or audio file.");
  }

  const file = message.document || message.photo?.slice(-1)[0] || message.video || message.audio;
  const fileType = message.document ? 'document' : message.photo ? 'photo' : message.video ? 'video' : 'audio';
  const customId = generateCustomId();
  const uploadDate = new Date().toLocaleString();

  db.set(customId, { file_id: file.file_id, fileType, uploader: ctx.from.id, uploadDate });
  saveDatabase();

  ctx.reply(`✅ File uploaded successfully!\nID: ${customId}\nPublic URL: ${getPublicFileUrl(bot.botInfo.username, customId)}`);

  await forwardFileToDatabase(ctx, file, fileType, customId, ctx.from.username, uploadDate);
});

// Command download
bot.command(['download', 'dl'], async (ctx) => {
  const fileId = ctx.message.text.split(' ')[1];
  const fileRecord = db.get(fileId);

  if (!fileRecord) {
    return ctx.reply('❌ File ID not found.');
  }

  const { file_id, fileType, uploader, uploadDate } = fileRecord;
  const downloadCaption = `📥 **File Downloaded**:\n- File ID: ${fileId}\n- Uploaded by: ${uploader}\n- Upload Date: ${uploadDate}\n- Type: ${fileType}`;

  if (fileType === 'document') {
    await ctx.telegram.sendDocument(ctx.chat.id, file_id, { caption: downloadCaption });
  } else if (fileType === 'photo') {
    await ctx.telegram.sendPhoto(ctx.chat.id, file_id, { caption: downloadCaption });
  } else if (fileType === 'video') {
    await ctx.telegram.sendVideo(ctx.chat.id, file_id, { caption: downloadCaption });
  } else if (fileType === 'audio') {
    await ctx.telegram.sendAudio(ctx.chat.id, file_id, { caption: downloadCaption });
  }

  console.log(`[LOG] User ${ctx.from.id} downloaded file with ID: ${fileId}`);
});

// Command delete
bot.command(['delete', 'dt'], async (ctx) => {
  const fileId = ctx.message.text.split(' ')[1];
  const fileRecord = db.get(fileId);

  if (!fileRecord) {
    return ctx.reply('❌ File ID not found.');
  }

  const { uploader } = fileRecord;
  const isOwner = ctx.from.id === Number(OWNER_ID);

  if (isOwner || uploader === ctx.from.id) {
    db.delete(fileId);
    saveDatabase();

    const deleteMessage = `🗑️ **File Deleted**:\n- File ID: ${fileId}\n- Deleted by: ${ctx.from.username || ctx.from.id}\n- Deletion Date: ${new Date().toLocaleString()}`;
    await ctx.telegram.sendMessage(CHANNEL_ID, deleteMessage);

    ctx.reply(`File ${fileId} deleted successfully.`);
    console.log(`[LOG] File ${fileId} deleted by user ${ctx.from.id}.`);
  } else {
    ctx.reply("❌ You don't have permission to delete this file.");
  }
});

// Command list untuk melihat file user
bot.command('list', (ctx) => {
  const userFiles = Array.from(db.entries())
    .filter(([_, data]) => data.uploader === ctx.from.id)
    .map(([id, data]) => `- ${id} (${data.fileType})`);

  if (userFiles.length === 0) {
    ctx.reply("📂 You have no uploaded files.");
  } else {
    ctx.reply(`📂 Your Uploaded Files:\n${userFiles.join('\n')}`);
  }
});

// Command listall khusus untuk owner
bot.command('listall', (ctx) => {
  if (ctx.from.id !== Number(OWNER_ID)) return;

  const allFiles = Array.from(db.entries())
    .map(([id, data]) => `- ${id} (${data.fileType}, by ${data.uploader})`);

  if (allFiles.length === 0) {
    ctx.reply("📂 No files uploaded.");
  } else {
    ctx.reply(`📂 All Uploaded Files:\n${allFiles.join('\n')}`);
  }
});

// Load database on startup
loadDatabase();

// Command revoke untuk mengganti ID custom file yang sudah di-upload
bot.command('revoke', async (ctx) => {
  const fileId = ctx.message.text.split(' ')[1];
  if (!fileId) return ctx.reply("❌ Please provide a file ID to revoke.");

  const fileRecord = db.get(fileId);

  if (!fileRecord) {
    return ctx.reply('❌ File ID not found.');
  }

  const { uploader, file_id, fileType, uploadDate } = fileRecord;
  const isOwner = ctx.from.id === Number(OWNER_ID);

  // Periksa apakah user adalah pemilik file atau admin
  if (isOwner || uploader === ctx.from.id) {
    // Generate ID baru
    const newId = generateCustomId();
    db.delete(fileId); // Hapus ID lama
    db.set(newId, { file_id, fileType, uploader, uploadDate });
    saveDatabase();

    // Kirim pesan notifikasi ke channel database
    const revokeMessage = `🔄 **File ID Updated**:\n- Old ID: ${fileId}\n- New ID: ${newId}\n- Updated by: ${ctx.from.username || ctx.from.id}\n- Update Date: ${new Date().toLocaleString()}`;
    await ctx.telegram.sendMessage(CHANNEL_ID, revokeMessage);

    // Kirim notifikasi ke pengguna
    ctx.reply(`✅ File ID successfully updated!\nNew ID: ${newId}\nPublic URL: ${getPublicFileUrl(bot.botInfo.username, newId)}`);
    console.log(`[LOG] File ID for ${fileId} updated to ${newId} by user ${ctx.from.id}.`);
  } else {
    ctx.reply("❌ You don't have permission to revoke this file ID.");
  }
});

// Launch bot dan logging
bot.launch().then(() => {
  console.log("[LOG] Bot has been launched successfully!");
}).catch((error) => {
  console.log(`[ERROR] Failed to launch bot: ${error.message}`);
});

// Error handler
bot.catch((error, ctx) => {
  console.log(`[ERROR] An error occurred for ${ctx.updateType}: ${error.message}`);
});

// Graceful shutdown handling
process.once('SIGINT', () => {
  console.log('[LOG] Bot shutting down (SIGINT)');
  saveDatabase();
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('[LOG] Bot shutting down (SIGTERM)');
  saveDatabase();
  bot.stop('SIGTERM');
});