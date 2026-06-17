import esbuild from 'esbuild'

const production = process.argv.includes('production')

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  // Provided by the Obsidian runtime — never bundle these.
  external: ['obsidian', 'electron'],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  outfile: 'main.js',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  logLevel: 'info'
})

if (production) {
  await context.rebuild()
  await context.dispose()
} else {
  await context.watch()
}
