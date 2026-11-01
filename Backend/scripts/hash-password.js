// Prints a salted scrypt hash for a password, in the format server.js stores:
//   scrypt$<salt hex>$<hash hex>
// The password is read from the terminal (hidden) or from stdin, never from
// the command line, so it does not end up in shell history.
const crypto = require("crypto");
const readline = require("readline");

const finish = (password) => {
  if (!password) {
    console.error("A password is required.");
    process.exit(1);
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  console.log(`scrypt$${salt}$${hash}`);
};

if (process.stdin.isTTY) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  rl._writeToOutput = () => {};
  process.stdout.write("Password (hidden): ");
  rl.question("", (password) => {
    rl.close();
    process.stdout.write("\n");
    finish(password);
  });
} else {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => finish(data.replace(/\r?\n$/, "")));
}
