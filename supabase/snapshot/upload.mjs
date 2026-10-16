// Uploads a snapshot to Google Drive and removes old ones.  node upload.mjs <file.psnap>
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export const FOLDER = "Pitstop Plus snapshots";
const DAY = 86_400_000;
const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_DRIVE_REFRESH_TOKEN: refreshToken } = process.env;

/** Which snapshots to delete. `files`: [{ id, name, createdTime }]. */
export function toDelete(files, now = Date.now()) {
  const newest = [...files].sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  return newest.slice(14).filter((f) => {
    const age = now - new Date(f.createdTime).getTime();
    const monthly = /-\d{4}-\d{2}-01\.psnap$/.test(f.name);
    return monthly ? age > 366 * DAY : age > 30 * DAY;
  });
}

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error ?? res.status}. The refresh token may have been revoked.`);
  return body.access_token;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Give the snapshot file to upload.");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN.");
  const token = await accessToken();
  const api = async (url, init = {}) => {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (!res.ok) throw new Error(`Google Drive: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res;
  };
  const list = async (q) => {
    const files = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({ q, fields: "nextPageToken, files(id, name, createdTime)", pageSize: "1000", spaces: "drive" });
      if (pageToken) params.set("pageToken", pageToken);
      const body = await (await api(`https://www.googleapis.com/drive/v3/files?${params}`)).json();
      files.push(...body.files);
      pageToken = body.nextPageToken ?? "";
    } while (pageToken);
    return files;
  };

  // The folder (made on the first run).
  const folders = await list(`name = '${FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const folderId =
    folders[0]?.id ??
    (
      await (
        await api("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }),
        })
      ).json()
    ).id;

  // Resumable upload, so large snapshots go through reliably.
  const data = readFileSync(file);
  const start = await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(data.length),
    },
    body: JSON.stringify({ name: basename(file), parents: [folderId] }),
  });
  const uploaded = await (
    await api(start.headers.get("location"), { method: "PUT", headers: { "Content-Length": String(data.length) }, body: data })
  ).json();
  console.log(`Uploaded to Google Drive: ${uploaded.name}`);

  // Only prune after a successful upload.
  const all = await list(`'${folderId}' in parents and trashed = false and name contains '.psnap'`);
  for (const f of toDelete(all)) {
    await api(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: "DELETE" });
    console.log(`Removed old snapshot: ${f.name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
