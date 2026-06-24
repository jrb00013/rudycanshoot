import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createReadStream } from "node:fs";

export async function uploadToImgur(imagePath, clientId) {
  if (!clientId) throw new Error("Imgur client_id required. Get one at https://api.imgur.com/oauth2/addclient");

  const data = await readFile(imagePath);
  const base64 = data.toString("base64");

  const body = new URLSearchParams({ image: base64, type: "base64", name: basename(imagePath) });

  const res = await fetch("https://api.imgur.com/3/image", {
    method: "POST",
    headers: { Authorization: `Client-ID ${clientId}` },
    body,
  });

  if (!res.ok) throw new Error(`Imgur upload failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { url: json.data.link, deleteHash: json.data.deletehash, id: json.data.id };
}

export async function uploadRaw(imagePath, uploadUrl, headers = {}) {
  const data = await readFile(imagePath);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "image/png",
      "content-length": String(data.length),
      ...headers,
    },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.status;
}
