const fs = require("fs");
const { google } = require("googleapis");
const { MongoClient } = require("mongodb");
const archiver = require("archiver");

console.log("🚀 Backup Service Started");

// ENV CHECK
console.log("MONGO_URI:", process.env.MONGO_URI ? "✅ Loaded" : "❌ Missing");
console.log("GOOGLE_TOKEN:", process.env.GOOGLE_TOKEN ? "✅ Loaded" : "❌ Missing");

// 🔥 OAuth setup (NO INTERACTIVE)
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost"
);

// 🔥 Load token from ENV
const token = JSON.parse(process.env.GOOGLE_TOKEN);
oAuth2Client.setCredentials(token);

const drive = google.drive({ version: "v3", auth: oAuth2Client });

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

// 🔥 Upload to Drive
async function upload() {
  try {
    const res = await drive.files.create({
      requestBody: {
        name: `backup-${Date.now()}.zip`,
        parents: ["1Y1pCDDvIhDvpyFjw8_MAb87bFsDVmKoH"], // folder ID
      },
      media: {
        mimeType: "application/zip",
        body: fs.createReadStream("backup.zip"),
      },
    });

    console.log("☁️ Uploaded:", res.data.id);

  } catch (err) {
    console.error("❌ Upload Error:", err);
  }
}

// 🔥 MAIN
async function main() {
  try {
    await backupDatabase();
    await createZip();
    await upload();

    console.log("🎉 BACKUP COMPLETED");

  } catch (err) {
    console.error("💥 ERROR:", err);
  }
}

main();