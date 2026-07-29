import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

function isPrivateAddress(address) {
  let normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.slice("::ffff:".length);
  }
  if (!isIP(normalized)) {
    return true;
  }
  if (normalized.includes(":")) {
    const [firstPart = "", secondPart = "0"] = normalized.split(":");
    const firstHextet = Number.parseInt(firstPart, 16);
    const secondHextet = Number.parseInt(secondPart || "0", 16);
    return (
      firstHextet < 0x2000 ||
      firstHextet > 0x3fff ||
      firstHextet === 0x2002 ||
      (firstHextet === 0x2001 && secondHextet <= 0x01ff) ||
      normalized.startsWith("2001:db8:") ||
      (firstHextet === 0x3fff && secondHextet <= 0x0fff)
    );
  }
  const [first, second, third] = normalized.split(".").map(Number);
  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function pinnedRequest(url, { address, family, method, signal }) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method,
        signal,
        servername: url.hostname,
        lookup(_hostname, _options, callback) {
          callback(null, address, family);
        }
      },
      (response) => {
        response.resume();
        resolve({
          status: response.statusCode ?? 0,
          location: response.headers.location ?? null
        });
      }
    );
    request.once("error", reject);
    request.end();
  });
}

function reportUrl(url) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export async function checkCatalogSources(
  sources,
  {
    requestImpl = pinnedRequest,
    resolveImpl = (hostname) => lookup(hostname, { all: true }),
    timeoutMs = 10_000,
    maxRedirects = 5
  } = {}
) {
  const results = [];

  for (const source of [...sources].sort((a, b) => a.id.localeCompare(b.id))) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let currentUrl = new URL(source.url);
      let response;
      let method = "HEAD";
      for (let redirectCount = 0; ; redirectCount += 1) {
        if (
          currentUrl.protocol !== "https:" ||
          currentUrl.username ||
          currentUrl.password ||
          currentUrl.hostname === "localhost" ||
          currentUrl.hostname.endsWith(".local")
        ) {
          throw new Error("UnsafeSourceUrl");
        }
        const addresses = await resolveImpl(currentUrl.hostname);
        if (
          addresses.length === 0 ||
          addresses.some(({ address }) => isPrivateAddress(address))
        ) {
          throw new Error("UnsafeSourceAddress");
        }
        const pinned = addresses[0];
        response = await requestImpl(currentUrl, {
          address: pinned.address,
          family: pinned.family,
          method,
          signal: controller.signal
        });
        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.location
        ) {
          if (redirectCount >= maxRedirects) {
            throw new Error("TooManyRedirects");
          }
          currentUrl = new URL(response.location, currentUrl);
          continue;
        }
        if (
          method === "HEAD" &&
          (response.status === 405 || response.status === 501)
        ) {
          method = "GET";
          continue;
        }
        break;
      }
      results.push({
        id: source.id,
        url: reportUrl(source.url),
        ok: response.status >= 200 && response.status < 300,
        status: response.status
      });
    } catch (error) {
      results.push({
        id: source.id,
        url: reportUrl(source.url),
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : "UnknownError"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    checked: results.length,
    broken: results.filter((result) => !result.ok).length,
    results
  };
}

function readLocalStatus() {
  const command =
    process.platform === "win32"
      ? {
          file: "cmd.exe",
          args: ["/d", "/s", "/c", "pnpm exec supabase status -o json"]
        }
      : {
          file: "pnpm",
          args: ["exec", "supabase", "status", "-o", "json"]
        };
  return JSON.parse(
    execFileSync(command.file, command.args, { encoding: "utf8" })
  );
}

export async function loadCatalogReleaseSources(status, fetchImpl = fetch) {
  const response = await fetchImpl(
    `${status.REST_URL}/rpc/list_catalog_release_sources`,
    {
      method: "POST",
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
        "content-type": "application/json"
      },
      body: "{}"
    }
  );
  if (!response.ok) {
    throw new Error(
      `Could not load catalog release sources (${response.status}).`
    );
  }
  return response.json();
}

async function main() {
  const status = readLocalStatus();
  const report = await checkCatalogSources(
    await loadCatalogReleaseSources(status)
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.broken > 0) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
