import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
const appUrlLine = "NEXT_PUBLIC_APP_URL=http://localhost:3000";

if (!fs.existsSync(envPath)) {
  process.exit(0);
}

const contents = fs.readFileSync(envPath, "utf8");
const hasAppUrl = /^\s*NEXT_PUBLIC_APP_URL\s*=/m.test(contents);

if (!hasAppUrl) {
  const separator = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(envPath, `${contents}${separator}${appUrlLine}\n`);
  console.log(`Added ${appUrlLine} to .env.local`);
}
