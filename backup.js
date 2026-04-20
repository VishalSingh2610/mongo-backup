const { exec } = require("child_process");
const fs = require("fs");
const archiver = require("archiver");
const { google } = require("googleapis");
console.log("ENV CHECK:", process.env.GOOGLE_CREDENTIALS);

// 🔥 Service Account
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

const uri = process.env.MONGO_URI;

// STEP 1: Dump
const dumpCommand = `mongodump --uri="${uri}" --out=backup`;

console.log("Starting backup...");

exec(dumpCommand, async (error, stdout, stderr) => {
  if (error) {
    console.error("Dump Error:", error);
    return;
  }

  console.log("Backup done");

  // STEP 2: Zip
  const output = fs.createWriteStream("backup.zip");
  const archive = archiver("zip");

  archive.pipe(output);
  archive.directory("backup/", false);

  await archive.finalize();

  console.log("Zip created");

  // STEP 3: Upload to Drive
  try {
    const response = await drive.files.create({
      requestBody: {
        name: `backup-${Date.now()}.zip`,
      },
      media: {
        mimeType: "application/zip",
        body: fs.createReadStream("backup.zip"),
      },
    });

    console.log("Uploaded to Drive ✅", response.data.id);
  } catch (err) {
    console.error("Upload Error:", err);
  }
});