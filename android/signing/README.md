# LuckyBean Android release signing

The private release keystore is never stored in this repository. GitHub Actions
reconstructs it from repository secrets only for the duration of a build.

Required repository secrets:

- `LUCKYBEAN_KEYSTORE_B64`
- `LUCKYBEAN_STORE_PASSWORD`
- `LUCKYBEAN_KEY_ALIAS`
- `LUCKYBEAN_KEY_PASSWORD`

The pinned SHA-256 certificate fingerprint is stored in `CERT_SHA256.txt`. A
release build must fail if its signer fingerprint differs from this value.

The original keystore must also have an encrypted offline backup. GitHub Secrets
cannot be read back and must not be treated as the only disaster-recovery copy.
