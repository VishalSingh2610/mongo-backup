const fs = require("fs");
const { google } = require("googleapis");
const { MongoClient } = require("mongodb");
const archiver = require("archiver");
const cron = require("node-cron");

console.log("🚀 Backup Service Started");

// ENV CHECK
console.log("MONGO_URI:", process.env.MONGO_URI ? "✅ Loaded" : "❌ Missing");
console.log("GOOGLE_TOKEN:", process.env.GOOGLE_TOKEN ? "✅ Loaded" : "❌ Missing");

// 🔥 OAuth setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost"
);

const token = JSON.parse(process.env.GOOGLE_TOKEN);
oAuth2Client.setCredentials(token);

const drive = google.drive({ version: "v3", auth: oAuth2Client });

// 🔥 CONFIG
const FOLDER_ID = "1Y1pCDDvIhDvpyFjw8_MAb87bFsDVmKoH";
const MAX_BACKUPS = 7;

// 🔥 Mongo Backup
async function backupDatabase() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();

  const db = client.db();
  const collections = await db.listCollections().toArray();

  const data = {};

  console.log("📥 Fetching collections...");

  for (let col of collections) {
    data[col.name] = await db.collection(col.name).find().toArray();
  }

  fs.writeFileSync("backup.json", JSON.stringify(data, null, 2));

  console.log("✅ Backup JSON created");

  await client.close();
}

// 🔥 ZIP
async function createZip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream("backup.zip");
    const archive = archiver("zip");

    archive.pipe(output);
    archive.file("backup.json", { name: "backup.json" });

    archive.on("end", () => {
      console.log("📦 Zip created");
      resolve();
    });

    archive.on("error", reject);

    archive.finalize();
  });
}

// 🔥 Upload
async function upload() {
  const res = await drive.files.create({
    requestBody: {
      name: `backup-${Date.now()}.zip`,
      parents: [FOLDER_ID],
    },
    media: {
      mimeType: "application/zip",
      body: fs.createReadStream("backup.zip"),
    },
  });

  console.log("☁️ Uploaded:", res.data.id);
}

// 🔥 Cleanup old backups
async function cleanupOldBackups() {
  console.log("🧹 Cleaning old backups...");

  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name contains 'backup-'`,
    orderBy: "createdTime desc",
    fields: "files(id, name, createdTime)",
  });

  const files = res.data.files;

  if (files.length <= MAX_BACKUPS) {
    console.log("✅ No cleanup needed");
    return;
  }

  const toDelete = files.slice(MAX_BACKUPS);

  for (let file of toDelete) {
    await drive.files.delete({ fileId: file.id });
    console.log("🗑️ Deleted:", file.name);
  }
}

// 🔥 MAIN FLOW
async function runBackup() {
  try {
    await backupDatabase();
    await createZip();
    await upload();
    await cleanupOldBackups();

    console.log("🎉 BACKUP COMPLETED");

  } catch (err) {
    console.error("💥 ERROR:", err);
  }
}

// 🔥 CRON JOB (Daily 2 AM)
cron.schedule("0 2 * * *", () => {
  console.log("⏰ Running scheduled backup...");
  runBackup();
});

// 🔥 RUN ON START
runBackup();