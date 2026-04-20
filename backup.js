const { exec } = require("child_process");

const uri = process.env.MONGO_URI;

const command = `mongodump --uri="${uri}" --out=backup`;

console.log("Starting backup...");

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(error);
    return;
  }
  console.log("Backup done");
});