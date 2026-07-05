import esbuild from 'esbuild'
import process from 'process'

const production = process.argv[2] === 'production'

const context = await esbuild.context({
    entryPoints: ['main.ts'],
    bundle: true,
    external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
    format: 'cjs',
    target: 'es2018',
    logLevel: 'info',
    sourcemap: production ? false : 'inline',
    treeShaking: true,
    outfile: 'main.js',
})

if (production) {
    await context.rebuild()
    process.exit(0)
} else {
    await context.watch()
}
