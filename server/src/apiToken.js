// API token value format and storage hash, shared by the auth plugin
// (verification) and the token routes (minting). The value is 256 bits of
// randomness behind a recognizable prefix; only its SHA-256 is stored.

import { createHash, randomBytes } from 'node:crypto'

export const TOKEN_PREFIX = 'dc_'

// What a token may do; a browser session (JWT) is the user in person and is
// never scope-checked.
export const TOKEN_SCOPES = ['decks', 'shares', 'drafts', 'assets', 'images']

export function newApiTokenValue() {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

export function apiTokenHash(value) {
  return createHash('sha256').update(value).digest('hex')
}
