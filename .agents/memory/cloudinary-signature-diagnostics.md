---
name: Cloudinary signature diagnostics
description: Distinguish malformed signed-upload parameters from mismatched Cloudinary credentials.
---

When Cloudinary returns `Invalid Signature`, compare its reported signing string with the server's exact signed parameters. If they match and the standard SHA-1 request still fails, validate the API key and API secret together using a read-only Cloudinary Admin API request; Cloudinary can explicitly report `api_secret mismatch`.

**Why:** A correct canonical string and hash implementation cannot compensate for an API secret that belongs to another key or product environment.

**How to apply:** Keep the secret server-side, never print it, and ask the user to replace the matching cloud name, API key, and API secret through Replit Secrets when the credential check fails.
