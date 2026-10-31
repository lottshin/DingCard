// Writes npm-shrinkwrap.json for the published package: package-lock.json
// without the packages only the build and the tests use.
//
// npm installs every package a dependency's shrinkwrap lists, dev ones
// included, so a plain copy of the lockfile sent esbuild for every platform,
// TypeScript and Vitest (about 325 MB) along with the 32 MB the server needs.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The lockfile without the dev-only packages and without the root's devDependencies. */
export function productionShrinkwrap(lock) {
  const packages = {}
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    if (location === '') {
      const root = { ...entry }
      delete root.devDependencies
      packages[location] = root
    } else if (!entry.dev) {
      packages[location] = entry
    }
  }
  return { ...lock, packages }
}

const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  writeFileSync('npm-shrinkwrap.json', `${JSON.stringify(productionShrinkwrap(lock), null, 2)}\n`)
}
