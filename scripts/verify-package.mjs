import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve('.output/chrome-mv3')
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
assert.equal(manifest.manifest_version, 3)
assert.equal(manifest.version, pkg.version)
assert.deepEqual([...manifest.permissions].sort(), ['cookies', 'scripting', 'storage'])
assert.equal(manifest.externally_connectable, undefined, 'Do not expose external runtime messaging')
assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/)
assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-eval|unsafe-inline|https:/)
for (const pattern of [...manifest.host_permissions, ...manifest.content_scripts.flatMap(script => script.matches)]) {
  assert.match(pattern, /^https:\/\//)
  assert(!pattern.includes('*.'), `Wildcard host access is not allowed: ${pattern}`)
  const host = new URL(pattern.replace(/\*$/, '')).hostname
  assert(['api.va.gov', 'va.gov', 'www.va.gov', 'veteranscentralhub.com', 'www.veteranscentralhub.com', 'veteranscentralhub.us', 'www.veteranscentralhub.us', 'claimbuilder.veteranscentralhub.com', 'claimbuilder.veteranscentralhub.us', 'extension.veteranscentralhub.com', 'www.extension.veteranscentralhub.com', 'extension.veteranscentralhub.us', 'www.extension.veteranscentralhub.us'].includes(host), `Unexpected host: ${host}`)
}
for (const [size, name] of Object.entries(manifest.icons)) {
  const png = await readFile(resolve(root, name))
  assert.equal(png.readUInt32BE(16), Number(size), `${name} must be ${size}px wide`)
  assert.equal(png.readUInt32BE(20), Number(size), `${name} must be ${size}px tall`)
}
const required = [manifest.action.default_popup, manifest.background.service_worker, ...manifest.content_scripts.flatMap(script => script.js)]
for (const name of required) assert((await readFile(resolve(root, name))).length, `Missing entry point: ${name}`)
const files = await readdir(root, { recursive: true, withFileTypes: true })
let fileCount = 0
for (const file of files.filter(entry => entry.isFile())) {
  const path = resolve(file.parentPath, file.name)
  const name = relative(root, path)
  assert(!/(^|[\/\\])(?:\.env(?:\..*)?|node_modules|tests|\.git)([\/\\]|$)/.test(name), `Unexpected packaged file: ${name}`)
  if (/\.(js|html)$/.test(name)) {
    const text = await readFile(path, 'utf8')
    assert(!/https?:\/\/(?:localhost|127\.0\.0\.1)(?:[:/]|$)/.test(text), `Development server URL in ${name}`)
    if (name.endsWith('.html')) assert(!/<script[^>]+src=["']https?:/i.test(text), `Remote script in ${name}`)
    assert(!/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\bsk_(?:live|test)_[a-z0-9]{16,}/i.test(text), `Possible private credential in ${name}`)
  }
  fileCount++
}
console.log(`Verified Manifest V3 package ${pkg.version}: ${fileCount} files, exact hosts, local scripts, entry points, and icon dimensions.`)
