import { spawnSync } from "node:child_process";

const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const baseBranch = process.env.GITHUB_BASE_REF;

if (process.env.CI) {
  const diffArguments = ["diff", "--check"];

  if (baseBranch) {
    diffArguments.push(`origin/${baseBranch}...HEAD`);
  } else {
    const parent = spawnSync("git", ["rev-parse", "--verify", "HEAD^"], {
      stdio: "ignore"
    });
    diffArguments.push(
      parent.status === 0 ? "HEAD^...HEAD" : emptyTree,
      "HEAD"
    );
  }

  const result = spawnSync("git", diffArguments, {
    stdio: "inherit",
    shell: false
  });

  process.exit(result.status ?? 1);
}

for (const diffArguments of [
  ["diff", "--check"],
  ["diff", "--cached", "--check"]
]) {
  const result = spawnSync("git", diffArguments, {
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
