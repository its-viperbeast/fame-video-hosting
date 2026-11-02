import { randomBytes, scryptSync } from "node:crypto";
import { Writable } from "node:stream";
import readline from "node:readline/promises";
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
process.stdout.write("New admin password (12+ characters): ");
hidden = true;
const password = await rl.question("");
hidden = false;
rl.close();
process.stdout.write("\n");
if (password.length < 12 || password.length > 256) {
  console.error("Use 12–256 characters.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
console.log(
  `AUTH_PASSWORD_HASH=${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
);
