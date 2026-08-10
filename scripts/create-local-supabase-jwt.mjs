import crypto from "node:crypto";

const subject = process.argv[2];
const secret = process.env.LOCAL_SUPABASE_JWT_SECRET;
if (!subject || !secret) throw new Error("Local JWT subject and secret are required");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
  aud: "authenticated",
  exp: now + 600,
  iat: now,
  iss: "supabase-demo",
  role: "authenticated",
  sub: subject,
})}`;
const signature = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
process.stdout.write(`${unsigned}.${signature}`);
