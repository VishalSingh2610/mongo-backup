const fs = require("fs");
const archiver = require("archiver");
const { google } = require("googleapis");
const { MongoClient } = require("mongodb");

console.log("🚀 Backup Service Started");

// 🔐 ENV CHECK
console.log("MONGO_URI:", process.env.MONGO_URI ? "✅ Loaded" : "❌ Missing");
console.log("GOOGLE_CREDENTIALS:", process.env.GOOGLE_CREDENTIALS ? "✅ Loaded" : "❌ Missing");

// 🔥 Parse credentials
const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
console.log("SERVICE EMAIL:", creds.client_email);

// 🔥 Google Auth (FIXED SCOPE ✅)
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/drive.file"], // 🔥 FIX
});

const drive = google.drive({ version: "v3", auth });

// 🔥 Mongo Backup
async function backupDatabase() {
  try {
    console.log("📦 Connecting to MongoDB...");
    console.log("FINAL URI:", process.env.MONGO_URI);

    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const db = client.db();
    const collections = await db.listCollections().toArray();

    const data = {};

    console.log("📥 Fetching collections...");

    for (let col of collections) {
      const docs = await db.collection(col.name).find().toArray();
      data[col.name] = docs;
    }

    fs.writeFileSync("backup.json", JSON.stringify(data, null, 2));

    console.log("✅ Backup JSON created");

    await client.close();

  } catch (err) {
    console.error("❌ Mongo Backup Error:", err);
    throw err;
  }
}

// 🔥 Zip
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

    archive.on("error", (err) => reject(err));

    archive.finalize();
  });
}

// 🔥 Upload (FINAL FIXED)
async function uploadToDrive() {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: `backup-${Date.now()}.zip`,
        parents: ["1Y1pCDDvIhDvpyFjw8_MAb87bFsDVmKoH"], // ✅ folder id
      },
      media: {
        mimeType: "application/zip",
        body: fs.createReadStream("backup.zip"),
      },
      supportsAllDrives: true,
    });

    console.log("☁️ Uploaded to Drive ✅", response.data.id);

  } catch (err) {
    console.error("❌ Drive Upload Error:", err);
  }
}

// 🔥 MAIN
async function runBackup() {
  try {
    await backupDatabase();
    await createZip();
    await uploadToDrive();

    console.log("🎉 BACKUP COMPLETED SUCCESSFULLY");

  } catch (err) {
    console.error("💥 Backup Failed:", err);
  }
}

runBackup();