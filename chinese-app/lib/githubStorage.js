'use strict';

// Uploads images to a SEPARATE GitHub repo via the Contents API and serves
// them from raw.githubusercontent.com. Configured via env:
//   GITHUB_IMAGE_REPO   e.g. 'cwko-1221/BuiO-images'  (REQUIRED)
//   GITHUB_TOKEN        fine-grained PAT with contents:write on that repo
//   GITHUB_IMAGE_BRANCH default 'main'
//
// Pros: free, unlimited, GitHub CDN.
// Cons: each upload is a Git commit (1–3s). Don't use for recordings.

function isConfigured() {
  return !!(process.env.GITHUB_IMAGE_REPO && process.env.GITHUB_TOKEN);
}

function repo() { return process.env.GITHUB_IMAGE_REPO; }
function branch() { return process.env.GITHUB_IMAGE_BRANCH || 'main'; }
function token() { return process.env.GITHUB_TOKEN; }

async function uploadImage({ path, buffer, contentType, message }) {
  if (!isConfigured()) throw new Error('GitHub image storage not configured.');
  const url = `https://api.github.com/repos/${repo()}/contents/${encodeURI(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: message || `Upload ${path}`,
      branch: branch(),
      content: buffer.toString('base64'),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub upload failed (${res.status}): ${err.message || res.statusText}`);
  }
  // Serve via the raw CDN; cache-buster comes from the timestamped filename.
  return {
    path,
    publicUrl: `https://raw.githubusercontent.com/${repo()}/${branch()}/${encodeURI(path)}`,
  };
}

module.exports = { isConfigured, uploadImage };
