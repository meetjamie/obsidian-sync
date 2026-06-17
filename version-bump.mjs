// Keeps manifest.json + versions.json in sync with package.json's version.
// Wired to the npm/pnpm `version` lifecycle script, so `pnpm version <patch|minor|major>`
// bumps all three, then you tag (no `v` prefix — see .npmrc) and push to release.
import { readFileSync, writeFileSync } from 'node:fs'

const targetVersion =
  process.env.npm_package_version ?? JSON.parse(readFileSync('package.json', 'utf8')).version

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
manifest.version = targetVersion
writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)

const versions = JSON.parse(readFileSync('versions.json', 'utf8'))
versions[targetVersion] = manifest.minAppVersion
writeFileSync('versions.json', `${JSON.stringify(versions, null, 2)}\n`)
