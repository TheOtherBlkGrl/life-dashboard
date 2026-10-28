# Clarissa's Dashboard

A private-feeling personal dashboard hosted on GitHub Pages. The repo is public, but everything sensitive is encrypted at rest.

## How the lock works
- You set a 6-digit PIN. The browser derives an AES-256-GCM key from it (PBKDF2-SHA256, 310,000 iterations).
- All private data (job applications, medications, appointments, bills, emails, calendar, journal) lives in `data/vault.enc` as ciphertext. GitHub never holds readable private data, and the PIN is never stored anywhere.
- The PIN is unrecoverable: if it is lost, the vault cannot be decrypted. Save it in a password manager.
- A 6-digit PIN protects against casual snooping, not a targeted attacker. Keep the repo's sensitive data limited accordingly.

## Updating data
Unlock the site, use "Manage data" at the bottom to edit the vault JSON, download the new `vault.enc`, and replace the file in the repo (or ask Fo to do it).

## Public data
`data/public.js` holds only the natal chart and the journal prompt list.
