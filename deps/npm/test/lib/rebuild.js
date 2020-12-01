const fs = require('fs')
const { resolve } = require('path')
const t = require('tap')
const requireInject = require('require-inject')

let result = ''

const npm = {
  globalDir: '',
  flatOptions: {
    global: false,
  },
  prefix: '',
}
const mocks = {
  '../../lib/npm.js': npm,
  '../../lib/utils/output.js': (...msg) => {
    result += msg.join('\n')
  },
  '../../lib/utils/usage.js': () => 'usage instructions',
}

const rebuild = requireInject('../../lib/rebuild.js', mocks)

t.afterEach(cb => {
  npm.prefix = ''
  npm.flatOptions.global = false
  npm.globalDir = ''
  result = ''
  cb()
})

t.test('no args', t => {
  const path = t.testdir({
    node_modules: {
      a: {
        'package.json': JSON.stringify({
          name: 'a',
          version: '1.0.0',
          bin: 'cwd',
          scripts: {
            preinstall: `node -e 'require("fs").writeFileSync("cwd", "")'`,
          },
        }),
      },
      b: {
        'package.json': JSON.stringify({
          name: 'b',
          version: '1.0.0',
          bin: 'cwd',
          scripts: {
            preinstall: `node -e 'require("fs").writeFileSync("cwd", "")'`,
          },
        }),
      },
    },
  })

  const aBuildFile = resolve(path, 'node_modules/a/cwd')
  const bBuildFile = resolve(path, 'node_modules/b/cwd')
  const aBinFile = resolve(path, 'node_modules/.bin/a')
  const bBinFile = resolve(path, 'node_modules/.bin/b')
  t.throws(() => fs.statSync(aBuildFile))
  t.throws(() => fs.statSync(bBuildFile))
  t.throws(() => fs.statSync(aBinFile))
  t.throws(() => fs.statSync(bBinFile))

  npm.prefix = path

  rebuild([], err => {
    if (err)
      throw err

    t.ok(() => fs.statSync(aBuildFile))
    t.ok(() => fs.statSync(bBuildFile))
    t.ok(() => fs.statSync(aBinFile))
    t.ok(() => fs.statSync(bBinFile))

    t.equal(
      result,
      'rebuilt dependencies successfully',
      'should output success msg'
    )

    t.end()
  })
})

t.test('filter by pkg name', t => {
  const path = t.testdir({
    node_modules: {
      a: {
        'index.js': '',
        'package.json': JSON.stringify({
          name: 'a',
          version: '1.0.0',
          bin: 'index.js',
        }),
      },
      b: {
        'index.js': '',
        'package.json': JSON.stringify({
          name: 'b',
          version: '1.0.0',
          bin: 'index.js',
        }),
      },
    },
  })

  npm.prefix = path

  const aBinFile = resolve(path, 'node_modules/.bin/a')
  const bBinFile = resolve(path, 'node_modules/.bin/b')
  t.throws(() => fs.statSync(aBinFile))
  t.throws(() => fs.statSync(bBinFile))

  rebuild(['b'], err => {
    if (err)
      throw err

    t.throws(() => fs.statSync(aBinFile), 'should not link a bin')
    t.ok(() => fs.statSync(bBinFile), 'should link filtered pkg bin')

    t.end()
  })
})

t.test('filter by pkg@<range>', t => {
  const path = t.testdir({
    node_modules: {
      a: {
        'index.js': '',
        'package.json': JSON.stringify({
          name: 'a',
          version: '1.0.0',
          bin: 'index.js',
        }),
        node_modules: {
          b: {
            'index.js': '',
            'package.json': JSON.stringify({
              name: 'b',
              version: '2.0.0',
              bin: 'index.js',
            }),
          },
        },
      },
      b: {
        'index.js': '',
        'package.json': JSON.stringify({
          name: 'b',
          version: '1.0.0',
          bin: 'index.js',
        }),
      },
    },
  })

  npm.prefix = path

  const bBinFile = resolve(path, 'node_modules/.bin/b')
  const nestedBinFile = resolve(path, 'node_modules/a/node_modules/.bin/b')

  rebuild(['b@2'], err => {
    if (err)
      throw err

    t.throws(() => fs.statSync(bBinFile), 'should not link b bin')
    t.ok(() => fs.statSync(nestedBinFile), 'should link filtered pkg bin')

    t.end()
  })
})

t.test('filter must be a semver version/range', t => {
  rebuild(['b:git+ssh://github.com/npm/arborist'], err => {
    t.match(
      err,
      /Error: `npm rebuild` only supports SemVer version\/range specifiers/,
      'should throw type error'
    )

    t.end()
  })
})

t.test('global prefix', t => {
  const globalPath = t.testdir({
    lib: {
      node_modules: {
        a: {
          'index.js': '',
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            bin: 'index.js',
          }),
        },
      },
    },
  })

  npm.flatOptions.global = true
  npm.globalDir = resolve(globalPath, 'lib', 'node_modules')

  rebuild([], err => {
    if (err)
      throw err

    t.ok(() => fs.statSync(resolve(globalPath, 'lib/node_modules/.bin/a')))

    t.equal(
      result,
      'rebuilt dependencies successfully',
      'should output success msg'
    )

    t.end()
  })
})
