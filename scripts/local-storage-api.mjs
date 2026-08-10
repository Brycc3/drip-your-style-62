const [operation, bucket, path, contentType] = process.argv.slice(2);
const apiUrl = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const userJwt = process.env.LOCAL_SUPABASE_USER_JWT;

if (!apiUrl || !anonKey || !userJwt || !operation || !bucket || !path) {
  throw new Error("Local Storage API configuration and arguments are required");
}

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${userJwt}`,
};
let response;

if (operation === "upload") {
  if (!contentType) throw new Error("Upload content type is required");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  response = await fetch(`${apiUrl}/storage/v1/object/${bucket}/${encodedPath}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": contentType },
    body: `Phase 4A isolated ${bucket} storage fixture`,
  });
} else if (operation === "remove") {
  response = await fetch(`${apiUrl}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
  });
} else {
  throw new Error(`Unsupported Storage API operation: ${operation}`);
}

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`Storage API ${operation} failed (${response.status}): ${detail}`);
}
