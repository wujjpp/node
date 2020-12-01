const { resolve } = require('path')

const t = require('tap')
const requireInject = require('require-inject')

t.cleanSnapshot = str => str.split(/\r\n/).join('\n')

const simpleNmFixture = {
  node_modules: {
    foo: {
      'package.json': JSON.stringify({
        name: 'foo',
        version: '1.0.0',
        dependencies: {
          bar: '^1.0.0',
        },
      }),
    },
    bar: {
      'package.json': JSON.stringify({
        name: 'bar',
        version: '1.0.0',
      }),
    },
    lorem: {
      'package.json': JSON.stringify({
        name: 'lorem',
        version: '1.0.0',
      }),
    },
  },
}

const diffDepTypesNmFixture = {
  node_modules: {
    'dev-dep': {
      'package.json': JSON.stringify({
        name: 'dev-dep',
        description: 'A DEV dep kind of dep',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
        },
      }),
    },
    'prod-dep': {
      'package.json': JSON.stringify({
        name: 'prod-dep',
        description: 'A PROD dep kind of dep',
        version: '1.0.0',
        dependencies: {
          bar: '^2.0.0',
        },
      }),
      node_modules: {
        bar: {
          'package.json': JSON.stringify({
            name: 'bar',
            description: 'A dep that bars',
            version: '2.0.0',
          }),
        },
      },
    },
    'optional-dep': {
      'package.json': JSON.stringify({
        name: 'optional-dep',
        description: 'Maybe a dep?',
        version: '1.0.0',
      }),
    },
    'peer-dep': {
      'package.json': JSON.stringify({
        name: 'peer-dep',
        description: 'Peer-dep description here',
        version: '1.0.0',
      }),
    },
    ...simpleNmFixture.node_modules,
  },
}

let prefix
let globalDir = 'MISSING_GLOBAL_DIR'
let result = ''
// note this _flatOptions representations is for tests-only and does not
// represent exactly the properties found in the actual flatOptions obj
const _flatOptions = {
  all: true,
  color: false,
  dev: false,
  depth: Infinity,
  global: false,
  json: false,
  link: false,
  only: null,
  parseable: false,
  get prefix () {
    return prefix
  },
  production: false,
}
const ls = requireInject('../../lib/ls.js', {
  '../../lib/npm.js': {
    flatOptions: _flatOptions,
    limit: {
      fetch: 3,
    },
    get prefix () {
      return _flatOptions.prefix
    },
    get globalDir () {
      return globalDir
    },
    config: {
      get (key) {
        return _flatOptions[key]
      },
    },
  },
  '../../lib/utils/output.js': msg => {
    result = msg
  },
})

const redactCwd = res =>
  res && res.replace(/\\+/g, '/').replace(new RegExp(__dirname.replace(/\\+/g, '/'), 'gi'), '{CWD}')

const jsonParse = res => JSON.parse(redactCwd(res))

const cleanUpResult = (done, t) => {
  result = ''
  done()
}

t.test('ls', (t) => {
  t.beforeEach(cleanUpResult)
  _flatOptions.json = false
  _flatOptions.unicode = false
  t.test('no args', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree representation of dependencies structure')
      t.end()
    })
  })

  t.test('missing package.json', (t) => {
    prefix = t.testdir({
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.matchSnapshot(
        redactCwd(err.message),
        'should log all extraneous deps on error msg'
      )
      t.matchSnapshot(redactCwd(result), 'should output tree missing name/version of top-level package')
      t.end()
    })
  })

  t.test('extraneous deps', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.equal(err.code, 'ELSPROBLEMS', 'should have error code')
      t.equal(
        redactCwd(err.message),
        'extraneous: lorem@1.0.0 {CWD}/ls-ls-extraneous-deps/node_modules/lorem',
        'should log extraneous dep as error'
      )
      t.matchSnapshot(redactCwd(result), 'should output containing problems info')
      t.end()
    })
  })

  t.test('with filter arg', (t) => {
    _flatOptions.color = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['lorem'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree contaning only occurences of filtered by package and coloured output')
      _flatOptions.color = false
      t.end()
    })
  })

  t.test('with dot filter arg', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          ipsum: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['.'], (err) => {
      t.ifError(err, 'should not throw on missing dep above current level')
      t.matchSnapshot(redactCwd(result), 'should output tree contaning only occurences of filtered by package and coloured output')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('with filter arg nested dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['bar'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree contaning only occurences of filtered package and its ancestors')
      t.end()
    })
  })

  t.test('with multiple filter args', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
          ipsum: '^1.0.0',
        },
      }),
      node_modules: {
        ...simpleNmFixture.node_modules,
        ipsum: {
          'package.json': JSON.stringify({
            name: 'ipsum',
            version: '1.0.0',
          }),
        },
      },
    })
    ls(['bar@*', 'lorem@1.0.0'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree contaning only occurences of multiple filtered packages and their ancestors')
      t.end()
    })
  })

  t.test('with missing filter arg', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['notadep'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree containing no dependencies info')
      t.equal(
        process.exitCode,
        1,
        'should exit with error code 1'
      )
      process.exitCode = 0
      t.end()
    })
  })

  t.test('default --depth value should be 0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = undefined
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree containing only top-level dependencies')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('--depth=0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree containing only top-level dependencies')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('--depth=1', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 1
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
          e: '^1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^1.0.0',
            },
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            dependencies: {
              c: '^1.0.0',
              d: '*',
            },
          }),
        },
        c: {
          'package.json': JSON.stringify({
            name: 'c',
            version: '1.0.0',
          }),
        },
        d: {
          'package.json': JSON.stringify({
            name: 'd',
            version: '1.0.0',
          }),
        },
        e: {
          'package.json': JSON.stringify({
            name: 'e',
            version: '1.0.0',
          }),
        },
      },
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree containing top-level deps and their deps only')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('missing/invalid/extraneous', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^2.0.0',
          ipsum: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.equal(err.code, 'ELSPROBLEMS', 'should have error code')
      t.equal(
        redactCwd(err.message).replace(/\r\n/g, '\n'),
        'invalid: foo@1.0.0 {CWD}/ls-ls-missing-invalid-extraneous/node_modules/foo\n' +
        'missing: ipsum@^1.0.0, required by test-npm-ls@1.0.0\n' +
        'extraneous: lorem@1.0.0 {CWD}/ls-ls-missing-invalid-extraneous/node_modules/lorem',
        'should log missing/invalid/extraneous errors'
      )
      t.matchSnapshot(redactCwd(result), 'should output tree containing missing, invalid, extraneous labels')
      t.end()
    })
  })

  t.test('coloured output', (t) => {
    _flatOptions.color = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^2.0.0',
          ipsum: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.equal(err.code, 'ELSPROBLEMS', 'should have error code')
      t.matchSnapshot(redactCwd(result), 'should output tree containing color info')
      _flatOptions.color = false
      t.end()
    })
  })

  t.test('--dev', (t) => {
    _flatOptions.dev = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing dev deps')
      _flatOptions.dev = false
      t.end()
    })
  })

  t.test('--only=development', (t) => {
    _flatOptions.only = 'development'
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing only development deps')
      _flatOptions.only = null
      t.end()
    })
  })

  t.test('--link', (t) => {
    _flatOptions.link = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
          'linked-dep': '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      'linked-dep': {
        'package.json': JSON.stringify({
          name: 'linked-dep',
          version: '1.0.0',
        }),
      },
      node_modules: {
        'linked-dep': t.fixture('symlink', '../linked-dep'),
        ...diffDepTypesNmFixture.node_modules,
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing linked deps')
      _flatOptions.link = false
      t.end()
    })
  })

  t.test('print deduped symlinks', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'print-deduped-symlinks',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
          b: '^1.0.0',
        },
      }),
      b: {
        'package.json': JSON.stringify({
          name: 'b',
          version: '1.0.0',
        }),
      },
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^1.0.0',
            },
          }),
        },
        b: t.fixture('symlink', '../b'),
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing linked deps')
      _flatOptions.link = false
      t.end()
    })
  })

  t.test('--production', (t) => {
    _flatOptions.production = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing production deps')
      _flatOptions.production = false
      t.end()
    })
  })

  t.test('--only=prod', (t) => {
    _flatOptions.only = 'prod'
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing only prod deps')
      _flatOptions.only = null
      t.end()
    })
  })

  t.test('--long', (t) => {
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree info with descriptions')
      _flatOptions.long = true
      t.end()
    })
  })

  t.test('--long --depth=0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing top-level deps with descriptions')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      _flatOptions.long = false
      t.end()
    })
  })

  t.test('json read problems', (t) => {
    prefix = t.testdir({
      'package.json': '{broken json',
    })
    ls([], (err) => {
      t.match(err, { code: 'EJSONPARSE' }, 'should throw EJSONPARSE error')
      t.matchSnapshot(redactCwd(result), 'should print empty result')
      t.end()
    })
  })

  t.test('empty location', (t) => {
    prefix = t.testdir({})
    ls([], (err) => {
      t.ifError(err, 'should not error out on empty locations')
      t.matchSnapshot(redactCwd(result), 'should print empty result')
      t.end()
    })
  })

  t.test('invalid peer dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^2.0.0', // mismatching version #
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree signaling mismatching peer dep in problems')
      t.end()
    })
  })

  t.test('invalid deduped dep', (t) => {
    _flatOptions.color = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'invalid-deduped-dep',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
          b: '^2.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^2.0.0',
            },
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
          }),
        },
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree signaling mismatching peer dep in problems')
      _flatOptions.color = false
      t.end()
    })
  })

  t.test('deduped missing dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
          b: '^1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^1.0.0',
            },
          }),
        },
      },
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.match(err.message, /missing: b@\^1.0.0/, 'should list missing dep problem')
      t.matchSnapshot(redactCwd(result), 'should output parseable signaling missing peer dep in problems')
      t.end()
    })
  })

  t.test('unmet peer dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        peerDependencies: {
          'peer-dep': '*',
        },
      }),
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.match(err.message, 'missing: peer-dep@*, required by test-npm-ls@1.0.0', 'should have missing peer-dep error msg')
      t.matchSnapshot(redactCwd(result), 'should output tree signaling missing peer dep in problems')
      t.end()
    })
  })

  t.test('unmet optional dep', (t) => {
    _flatOptions.color = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'missing-optional-dep': '^1.0.0',
          'optional-dep': '^2.0.0', // mismatching version #
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.match(err.message, /invalid: optional-dep@1.0.0/, 'should have invalid dep error msg')
      t.matchSnapshot(redactCwd(result), 'should output tree with empty entry for missing optional deps')
      _flatOptions.color = false
      t.end()
    })
  })

  t.test('cycle deps', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^1.0.0',
            },
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            dependencies: {
              a: '^1.0.0',
            },
          }),
        },
      },
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should print tree output containing deduped ref')
      t.end()
    })
  })

  t.test('cycle deps with filter args', (t) => {
    _flatOptions.color = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^1.0.0',
            },
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            dependencies: {
              a: '^1.0.0',
            },
          }),
        },
      },
    })
    ls(['a'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should print tree output containing deduped ref')
      _flatOptions.color = false
      t.end()
    })
  })

  t.test('with no args dedupe entries', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'dedupe-entries',
        version: '1.0.0',
        dependencies: {
          '@npmcli/a': '^1.0.0',
          '@npmcli/b': '^1.0.0',
          '@npmcli/c': '^1.0.0',
        },
      }),
      node_modules: {
        '@npmcli': {
          a: {
            'package.json': JSON.stringify({
              name: '@npmcli/a',
              version: '1.0.0',
              dependencies: {
                '@npmcli/b': '^1.0.0',
              },
            }),
          },
          b: {
            'package.json': JSON.stringify({
              name: '@npmcli/b',
              version: '1.1.2',
            }),
          },
          c: {
            'package.json': JSON.stringify({
              name: '@npmcli/c',
              version: '1.0.0',
              dependencies: {
                '@npmcli/b': '^1.0.0',
              },
            }),
          },
        },
      },
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should print tree output containing deduped ref')
      t.end()
    })
  })

  t.test('with no args dedupe entries and not displaying all', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'dedupe-entries',
        version: '1.0.0',
        dependencies: {
          '@npmcli/a': '^1.0.0',
          '@npmcli/b': '^1.0.0',
          '@npmcli/c': '^1.0.0',
        },
      }),
      node_modules: {
        '@npmcli': {
          a: {
            'package.json': JSON.stringify({
              name: '@npmcli/a',
              version: '1.0.0',
              dependencies: {
                '@npmcli/b': '^1.0.0',
              },
            }),
          },
          b: {
            'package.json': JSON.stringify({
              name: '@npmcli/b',
              version: '1.1.2',
            }),
          },
          c: {
            'package.json': JSON.stringify({
              name: '@npmcli/c',
              version: '1.0.0',
              dependencies: {
                '@npmcli/b': '^1.0.0',
              },
            }),
          },
        },
      },
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should print tree output containing deduped ref')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('with args and dedupe entries', (t) => {
    _flatOptions.color = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'dedupe-entries',
        version: '1.0.0',
        dependencies: {
          '@npmcli/a': '^1.0.0',
          '@npmcli/b': '^1.0.0',
          '@npmcli/c': '^1.0.0',
        },
      }),
      node_modules: {
        '@npmcli': {
          a: {
            'package.json': JSON.stringify({
              name: '@npmcli/a',
              version: '1.0.0',
              dependencies: {
                '@npmcli/b': '^1.0.0',
              },
            }),
          },
          b: {
            'package.json': JSON.stringify({
              name: '@npmcli/b',
              version: '1.1.2',
            }),
          },
          c: {
            'package.json': JSON.stringify({
              name: '@npmcli/c',
              version: '1.0.0',
              dependencies: {
                '@npmcli/b': '^1.0.0',
              },
            }),
          },
        },
      },
    })
    ls(['@npmcli/b'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should print tree output containing deduped ref')
      _flatOptions.color = false
      t.end()
    })
  })

  t.test('with args and different order of items', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'dedupe-entries',
        version: '1.0.0',
        dependencies: {
          '@npmcli/a': '^1.0.0',
          '@npmcli/b': '^1.0.0',
          '@npmcli/c': '^1.0.0',
        },
      }),
      node_modules: {
        '@npmcli': {
          a: {
            'package.json': JSON.stringify({
              name: '@npmcli/a',
              version: '1.0.0',
              dependencies: {
                '@npmcli/c': '^1.0.0',
              },
            }),
          },
          b: {
            'package.json': JSON.stringify({
              name: '@npmcli/b',
              version: '1.1.2',
              dependencies: {
                '@npmcli/c': '^1.0.0',
              },
            }),
          },
          c: {
            'package.json': JSON.stringify({
              name: '@npmcli/c',
              version: '1.0.0',
            }),
          },
        },
      },
    })
    ls(['@npmcli/c'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should print tree output containing deduped ref')
      t.end()
    })
  })

  t.test('using aliases', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: 'npm:b@1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            _from: 'a@npm:b',
            _resolved: 'https://localhost:8080/abbrev/-/abbrev-1.1.1.tgz',
            _requested: {
              type: 'alias',
            },
          }),
        },
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing aliases')
      t.end()
    })
  })

  t.test('resolved points to git ref', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          abbrev: 'git+https://github.com/isaacs/abbrev-js.git',
        },
      }),
      node_modules: {
        abbrev: {
          'package.json': JSON.stringify({
            name: 'abbrev',
            version: '1.1.1',
            _id: 'abbrev@1.1.1',
            _from: 'git+https://github.com/isaacs/abbrev-js.git',
            _resolved: 'git+https://github.com/isaacs/abbrev-js.git#b8f3a2fc0c3bb8ffd8b0d0072cc6b5a3667e963c',
            _requested: {
              type: 'git',
              raw: 'git+https:github.com/isaacs/abbrev-js.git',
              rawSpec: 'git+https:github.com/isaacs/abbrev-js.git',
              saveSpec: 'git+https://github.com/isaacs/abbrev-js.git',
              fetchSpec: 'https://github.com/isaacs/abbrev-js.git',
              gitCommittish: null,
            },
          }),
        },
      },
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree containing git refs')
      t.end()
    })
  })

  t.test('broken resolved field', (t) => {
    prefix = t.testdir({
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.1',
          }),
        },
      },
      'package-lock.json': JSON.stringify({
        name: 'npm-broken-resolved-field-test',
        version: '1.0.0',
        lockfileVersion: 2,
        requires: true,
        packages: {
          '': {
            name: 'a',
            version: '1.0.1',
          },
        },
        dependencies: {
          a: {
            version: '1.0.1',
            resolved: 'foo@bar://b8f3a2fc0c3bb8ffd8b0d0072cc6b5a3667e963c',
            integrity: 'sha512-8AN9lNCcBt5Xeje7fMEEpp5K3rgcAzIpTtAjYb/YMUYu8SbIVF6wz0WqACDVKvpQOUcSfNHZQNLNmue0QSwXOQ==',
          },
        },
      }),
      'package.json': JSON.stringify({
        name: 'npm-broken-resolved-field-test',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.1',
        },
      }),
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should NOT print git refs in output tree')
      t.end()
    })
  })

  t.test('from and resolved properties', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'simple-output': '^2.0.0',
        },
      }),
      node_modules: {
        'simple-output': {
          'package.json': JSON.stringify({
            name: 'simple-output',
            version: '2.1.1',
            _from: 'simple-output',
            _id: 'simple-output@2.1.1',
            _resolved: 'https://registry.npmjs.org/simple-output/-/simple-output-2.1.1.tgz',
            _requested: {
              type: 'tag',
              registry: true,
              raw: 'simple-output',
              name: 'simple-output',
              escapedName: 'simple-output',
              rawSpec: '',
              saveSpec: null,
              fetchSpec: 'latest',
            },
            _requiredBy: [
              '#USER',
              '/',
            ],
            _shasum: '3c07708ec9ef3e3c985cf0ddd67df09ab8ec2abc',
            _spec: 'simple-output',
          }),
        },
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should not be printed in tree output')
      t.end()
    })
  })

  t.test('global', (t) => {
    _flatOptions.global = true
    const fixtures = t.testdir({
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
          }),
          node_modules: {
            c: {
              'package.json': JSON.stringify({
                name: 'c',
                version: '1.0.0',
              }),
            },
          },
        },
      },
    })

    // mimics lib/npm.js globalDir getter but pointing to fixtures
    globalDir = resolve(fixtures, 'node_modules')

    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should print tree and not mark top-level items extraneous')
      globalDir = 'MISSING_GLOBAL_DIR'
      _flatOptions.global = false
      t.end()
    })
  })

  t.test('filtering by child of missing dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'filter-by-child-of-missing-dep',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
        },
      }),
      node_modules: {
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            dependencies: {
              c: '^1.0.0',
            },
          }),
        },
        c: {
          'package.json': JSON.stringify({
            name: 'c',
            version: '1.0.0',
          }),
        },
        d: {
          'package.json': JSON.stringify({
            name: 'd',
            version: '1.0.0',
            dependencies: {
              c: '^2.0.0',
            },
          }),
          node_modules: {
            c: {
              'package.json': JSON.stringify({
                name: 'c',
                version: '2.0.0',
              }),
            },
          },
        },
      },
    })

    ls(['c'], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.matchSnapshot(redactCwd(result), 'should print tree and not duplicate child of missing items')
      t.end()
    })
  })

  t.test('loading a tree containing workspaces', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'filter-by-child-of-missing-dep',
        version: '1.0.0',
        workspaces: [
          './a',
          './b',
        ],
      }),
      node_modules: {
        a: t.fixture('symlink', '../a'),
        b: t.fixture('symlink', '../b'),
        c: {
          'package.json': JSON.stringify({
            name: 'c',
            version: '1.0.0',
          }),
        },
      },
      a: {
        'package.json': JSON.stringify({
          name: 'a',
          version: '1.0.0',
          dependencies: {
            c: '^1.0.0',
          },
        }),
      },
      b: {
        'package.json': JSON.stringify({
          name: 'b',
          version: '1.0.0',
        }),
      },
    })

    ls([], (err) => {
      t.ifError(err, 'should NOT have ELSPROBLEMS error code')
      t.matchSnapshot(redactCwd(result), 'should list workspaces properly')

      // should also be able to filter out one of the workspaces
      ls(['a'], (err) => {
        t.ifError(err, 'should NOT have ELSPROBLEMS error code when filter')
        t.matchSnapshot(redactCwd(result), 'should filter single workspace')

        t.end()
      })
    })
  })

  t.test('filter pkg arg using depth option', (t) => {
    _flatOptions.depth = 0
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-pkg-arg-filter-with-depth-opt',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
          b: '^1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            dependencies: {
              c: '^1.0.0',
            },
          }),
        },
        c: {
          'package.json': JSON.stringify({
            name: 'c',
            version: '1.0.0',
            dependencies: {
              d: '^1.0.0',
            },
          }),
        },
        d: {
          'package.json': JSON.stringify({
            name: 'd',
            version: '1.0.0',
            dependencies: {
              a: '^1.0.0',
            },
          }),
        },
      },
    })

    t.plan(6)
    ls(['a'], (err) => {
      t.ifError(err, 'should NOT have ELSPROBLEMS error code')
      t.matchSnapshot(redactCwd(result), 'should list a in top-level only')

      ls(['d'], (err) => {
        t.ifError(err, 'should NOT have ELSPROBLEMS error code when filter')
        t.matchSnapshot(redactCwd(result), 'should print empty results msg')

        // if no --depth config is defined, should print path to dep
        _flatOptions.depth = null // default config value
        ls(['d'], (err) => {
          t.ifError(err, 'should NOT have ELSPROBLEMS error code when filter')
          t.matchSnapshot(redactCwd(result), 'should print expected result')
        })
      })
    })
  })

  t.teardown(() => {
    _flatOptions.depth = Infinity
  })

  t.end()
})

t.test('ls --parseable', (t) => {
  t.beforeEach(cleanUpResult)
  _flatOptions.json = false
  _flatOptions.unicode = false
  _flatOptions.parseable = true
  t.test('no args', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable representation of dependencies structure')
      t.end()
    })
  })

  t.test('missing package.json', (t) => {
    prefix = t.testdir({
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.matchSnapshot(
        redactCwd(err.message),
        'should log all extraneous deps on error msg'
      )
      t.matchSnapshot(redactCwd(result), 'should output parseable missing name/version of top-level package')
      t.end()
    })
  })

  t.test('extraneous deps', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.equal(err.code, 'ELSPROBLEMS', 'should have error code')
      t.matchSnapshot(redactCwd(result), 'should output containing problems info')
      t.end()
    })
  })

  t.test('with filter arg', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['lorem'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable contaning only occurences of filtered by package')
      t.end()
    })
  })

  t.test('with filter arg nested dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['bar'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable contaning only occurences of filtered package')
      t.end()
    })
  })

  t.test('with multiple filter args', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
          ipsum: '^1.0.0',
        },
      }),
      node_modules: {
        ...simpleNmFixture.node_modules,
        ipsum: {
          'package.json': JSON.stringify({
            name: 'ipsum',
            version: '1.0.0',
          }),
        },
      },
    })
    ls(['bar@*', 'lorem@1.0.0'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable contaning only occurences of multiple filtered packages and their ancestors')
      t.end()
    })
  })

  t.test('with missing filter arg', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['notadep'], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable output containing no dependencies info')
      t.equal(
        process.exitCode,
        1,
        'should exit with error code 1'
      )
      process.exitCode = 0
      t.end()
    })
  })

  t.test('default --depth value should be 0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = undefined
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable output containing only top-level dependencies')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('--depth=0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output tree containing only top-level dependencies')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('--depth=1', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 1
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable containing top-level deps and their deps only')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('missing/invalid/extraneous', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^2.0.0',
          ipsum: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.match(err, { code: 'ELSPROBLEMS' }, 'should list dep problems')
      t.matchSnapshot(redactCwd(result), 'should output parseable containing top-level deps and their deps only')
      t.end()
    })
  })

  t.test('--dev', (t) => {
    _flatOptions.dev = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing dev deps')
      _flatOptions.dev = false
      t.end()
    })
  })

  t.test('--only=development', (t) => {
    _flatOptions.only = 'development'
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing only development deps')
      _flatOptions.only = null
      t.end()
    })
  })

  t.test('--link', (t) => {
    _flatOptions.link = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
          'linked-dep': '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      'linked-dep': {
        'package.json': JSON.stringify({
          name: 'linked-dep',
          version: '1.0.0',
        }),
      },
      node_modules: {
        'linked-dep': t.fixture('symlink', '../linked-dep'),
        ...diffDepTypesNmFixture.node_modules,
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing linked deps')
      _flatOptions.link = false
      t.end()
    })
  })

  t.test('--production', (t) => {
    _flatOptions.production = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing production deps')
      _flatOptions.production = false
      t.end()
    })
  })

  t.test('--only=prod', (t) => {
    _flatOptions.only = 'prod'
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing only prod deps')
      _flatOptions.only = null
      t.end()
    })
  })

  t.test('--long', (t) => {
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree info with descriptions')
      _flatOptions.long = true
      t.end()
    })
  })

  t.test('--long with extraneous deps', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.equal(err.code, 'ELSPROBLEMS', 'should have error code')
      t.match(redactCwd(err.message), 'extraneous: lorem@1.0.0 {CWD}/ls-ls-parseable--long-with-extraneous-deps/node_modules/lorem', 'should have error code')
      t.matchSnapshot(redactCwd(result), 'should output long parseable output with extraneous info')
      t.end()
    })
  })

  t.test('--long missing/invalid/extraneous', (t) => {
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^2.0.0',
          ipsum: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.match(err, { code: 'ELSPROBLEMS' }, 'should list dep problems')
      t.matchSnapshot(redactCwd(result), 'should output parseable result containing EXTRANEOUS/INVALID labels')
      _flatOptions.long = false
      t.end()
    })
  })

  t.test('--long print symlink target location', (t) => {
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
          'linked-dep': '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      'linked-dep': {
        'package.json': JSON.stringify({
          name: 'linked-dep',
          version: '1.0.0',
        }),
      },
      node_modules: {
        'linked-dep': t.fixture('symlink', '../linked-dep'),
        ...diffDepTypesNmFixture.node_modules,
      },
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.matchSnapshot(redactCwd(result), 'should output parseable results with symlink targets')
      _flatOptions.long = false
      t.end()
    })
  })

  t.test('--long --depth=0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing top-level deps with descriptions')
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      _flatOptions.long = false
      t.end()
    })
  })

  t.test('json read problems', (t) => {
    prefix = t.testdir({
      'package.json': '{broken json',
    })
    ls([], (err) => {
      t.match(err, { code: 'EJSONPARSE' }, 'should throw EJSONPARSE error')
      t.matchSnapshot(redactCwd(result), 'should print empty result')
      t.end()
    })
  })

  t.test('empty location', (t) => {
    prefix = t.testdir({})
    ls([], (err) => {
      t.ifError(err, 'should not error out on empty locations')
      t.matchSnapshot(redactCwd(result), 'should print empty result')
      t.end()
    })
  })

  t.test('unmet peer dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^2.0.0', // mismatching version #
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output parseable signaling missing peer dep in problems')
      t.end()
    })
  })

  t.test('unmet optional dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'missing-optional-dep': '^1.0.0',
          'optional-dep': '^2.0.0', // mismatching version #
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.match(err.message, /invalid: optional-dep@1.0.0/, 'should have invalid dep error msg')
      t.matchSnapshot(redactCwd(result), 'should output parseable with empty entry for missing optional deps')
      t.end()
    })
  })

  t.test('cycle deps', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^1.0.0',
            },
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            dependencies: {
              a: '^1.0.0',
            },
          }),
        },
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should print tree output ommiting deduped ref')
      t.end()
    })
  })

  t.test('using aliases', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: 'npm:b@1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            _from: 'a@npm:b',
            _resolved: 'https://localhost:8080/abbrev/-/abbrev-1.1.1.tgz',
            _requested: {
              type: 'alias',
            },
          }),
        },
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing aliases')
      t.end()
    })
  })

  t.test('resolved points to git ref', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          abbrev: 'git+https://github.com/isaacs/abbrev-js.git',
        },
      }),
      node_modules: {
        abbrev: {
          'package.json': JSON.stringify({
            name: 'abbrev',
            version: '1.1.1',
            _id: 'abbrev@1.1.1',
            _from: 'git+https://github.com/isaacs/abbrev-js.git',
            _resolved: 'git+https://github.com/isaacs/abbrev-js.git#b8f3a2fc0c3bb8ffd8b0d0072cc6b5a3667e963c',
            _requested: {
              type: 'git',
              raw: 'git+https:github.com/isaacs/abbrev-js.git',
              rawSpec: 'git+https:github.com/isaacs/abbrev-js.git',
              saveSpec: 'git+https://github.com/isaacs/abbrev-js.git',
              fetchSpec: 'https://github.com/isaacs/abbrev-js.git',
              gitCommittish: null,
            },
          }),
        },
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should output tree containing git refs')
      t.end()
    })
  })

  t.test('from and resolved properties', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'simple-output': '^2.0.0',
        },
      }),
      node_modules: {
        'simple-output': {
          'package.json': JSON.stringify({
            name: 'simple-output',
            version: '2.1.1',
            _from: 'simple-output',
            _id: 'simple-output@2.1.1',
            _resolved: 'https://registry.npmjs.org/simple-output/-/simple-output-2.1.1.tgz',
            _requested: {
              type: 'tag',
              registry: true,
              raw: 'simple-output',
              name: 'simple-output',
              escapedName: 'simple-output',
              rawSpec: '',
              saveSpec: null,
              fetchSpec: 'latest',
            },
            _requiredBy: [
              '#USER',
              '/',
            ],
            _shasum: '3c07708ec9ef3e3c985cf0ddd67df09ab8ec2abc',
            _spec: 'simple-output',
          }),
        },
      },
    })
    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should not be printed in tree output')
      t.end()
    })
  })

  t.test('global', (t) => {
    _flatOptions.global = true
    const fixtures = t.testdir({
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
          }),
          node_modules: {
            c: {
              'package.json': JSON.stringify({
                name: 'c',
                version: '1.0.0',
              }),
            },
          },
        },
      },
    })

    // mimics lib/npm.js globalDir getter but pointing to fixtures
    globalDir = resolve(fixtures, 'node_modules')

    ls([], () => {
      t.matchSnapshot(redactCwd(result), 'should print parseable output for global deps')
      globalDir = 'MISSING_GLOBAL_DIR'
      _flatOptions.global = false
      t.end()
    })
  })

  t.end()
})

t.test('ls --json', (t) => {
  t.beforeEach(cleanUpResult)
  _flatOptions.json = true
  _flatOptions.parseable = false
  t.test('no args', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            foo: {
              version: '1.0.0',
              dependencies: {
                bar: {
                  version: '1.0.0',
                },
              },
            },
            lorem: {
              version: '1.0.0',
            },
          },
        },
        'should output json representation of dependencies structure'
      )
      t.end()
    })
  })

  t.test('missing package.json', (t) => {
    prefix = t.testdir({
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.match(err, { code: 'ELSPROBLEMS' }, 'should list dep problems')
      t.deepEqual(
        jsonParse(result),
        {
          problems: [
            'extraneous: bar@1.0.0 {CWD}/ls-ls-json-missing-package-json/node_modules/bar',
            'extraneous: foo@1.0.0 {CWD}/ls-ls-json-missing-package-json/node_modules/foo',
            'extraneous: lorem@1.0.0 {CWD}/ls-ls-json-missing-package-json/node_modules/lorem',
          ],
          dependencies: {
            bar: {
              version: '1.0.0',
              extraneous: true,
              problems: [
                'extraneous: bar@1.0.0 {CWD}/ls-ls-json-missing-package-json/node_modules/bar',
              ],
            },
            foo: {
              version: '1.0.0',
              extraneous: true,
              problems: [
                'extraneous: foo@1.0.0 {CWD}/ls-ls-json-missing-package-json/node_modules/foo',
              ],
              dependencies: {
                bar: {
                  version: '1.0.0',
                },
              },
            },
            lorem: {
              version: '1.0.0',
              extraneous: true,
              problems: [
                'extraneous: lorem@1.0.0 {CWD}/ls-ls-json-missing-package-json/node_modules/lorem',
              ],
            },
          },
        },
        'should output json missing name/version of top-level package'
      )
      t.end()
    })
  })

  t.test('extraneous deps', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.equal(
        redactCwd(err.message),
        'extraneous: lorem@1.0.0 {CWD}/ls-ls-json-extraneous-deps/node_modules/lorem',
        'should log extraneous dep as error'
      )
      t.equal(
        err.code,
        'ELSPROBLEMS',
        'should have ELSPROBLEMS error code'
      )
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          problems: [
            'extraneous: lorem@1.0.0 {CWD}/ls-ls-json-extraneous-deps/node_modules/lorem',
          ],
          dependencies: {
            foo: {
              version: '1.0.0',
              dependencies: {
                bar: {
                  version: '1.0.0',
                },
              },
            },
            lorem: {
              version: '1.0.0',
              extraneous: true,
              problems: [
                'extraneous: lorem@1.0.0 {CWD}/ls-ls-json-extraneous-deps/node_modules/lorem',
              ],
            },
          },
        },
        'should output json containing problems info'
      )
      t.end()
    })
  })

  t.test('with filter arg', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['lorem'], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            lorem: {
              version: '1.0.0',
            },
          },
        },
        'should output json contaning only occurences of filtered by package'
      )
      t.equal(
        process.exitCode,
        0,
        'should exit with error code 0'
      )
      t.end()
    })
  })

  t.test('with filter arg nested dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['bar'], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            foo: {
              version: '1.0.0',
              dependencies: {
                bar: {
                  version: '1.0.0',
                },
              },
            },
          },
        },
        'should output json contaning only occurences of filtered by package'
      )
      t.end()
    })
  })

  t.test('with multiple filter args', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
          ipsum: '^1.0.0',
        },
      }),
      node_modules: {
        ...simpleNmFixture.node_modules,
        ipsum: {
          'package.json': JSON.stringify({
            name: 'ipsum',
            version: '1.0.0',
          }),
        },
      },
    })
    ls(['bar@*', 'lorem@1.0.0'], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          version: '1.0.0',
          name: 'test-npm-ls',
          dependencies: {
            foo: {
              version: '1.0.0',
              dependencies: {
                bar: {
                  version: '1.0.0',
                },
              },
            },
            lorem: {
              version: '1.0.0',
            },
          },
        },
        'should output json contaning only occurences of multiple filtered packages and their ancestors'
      )
      t.end()
    })
  })

  t.test('with missing filter arg', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls(['notadep'], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
        },
        'should output json containing no dependencies info'
      )
      t.equal(
        process.exitCode,
        1,
        'should exit with error code 1'
      )
      process.exitCode = 0
      t.end()
    })
  })

  t.test('default --depth value should now be 0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = undefined
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            foo: {
              version: '1.0.0',
            },
            lorem: {
              version: '1.0.0',
            },
          },
        },
        'should output json containing only top-level dependencies'
      )
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('--depth=0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            foo: {
              version: '1.0.0',
            },
            lorem: {
              version: '1.0.0',
            },
          },
        },
        'should output json containing only top-level dependencies'
      )
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('--depth=1', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 1
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
          lorem: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.ifError(err, 'npm ls')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            foo: {
              version: '1.0.0',
              dependencies: {
                bar: {
                  version: '1.0.0',
                },
              },
            },
            lorem: {
              version: '1.0.0',
            },
          },
        },
        'should output json containing top-level deps and their deps only'
      )
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      t.end()
    })
  })

  t.test('missing/invalid/extraneous', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          foo: '^2.0.0',
          ipsum: '^1.0.0',
        },
      }),
      ...simpleNmFixture,
    })
    ls([], (err) => {
      t.match(err, { code: 'ELSPROBLEMS' }, 'should list dep problems')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          problems: [
            'invalid: foo@1.0.0 {CWD}/ls-ls-json-missing-invalid-extraneous/node_modules/foo',
            'missing: ipsum@^1.0.0, required by test-npm-ls@1.0.0',
            'extraneous: lorem@1.0.0 {CWD}/ls-ls-json-missing-invalid-extraneous/node_modules/lorem',
          ],
          dependencies: {
            foo: {
              version: '1.0.0',
              invalid: true,
              problems: [
                'invalid: foo@1.0.0 {CWD}/ls-ls-json-missing-invalid-extraneous/node_modules/foo',
              ],
              dependencies: {
                bar: {
                  version: '1.0.0',
                },
              },
            },
            lorem: {
              version: '1.0.0',
              extraneous: true,
              problems: [
                'extraneous: lorem@1.0.0 {CWD}/ls-ls-json-missing-invalid-extraneous/node_modules/lorem',
              ],
            },
            ipsum: {
              required: '^1.0.0',
              missing: true,
              problems: [
                'missing: ipsum@^1.0.0, required by test-npm-ls@1.0.0',
              ],
            },
          },
        },
        'should output json containing top-level deps and their deps only'
      )
      t.end()
    })
  })

  t.test('--dev', (t) => {
    _flatOptions.dev = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            'dev-dep': {
              version: '1.0.0',
              dependencies: {
                foo: {
                  version: '1.0.0',
                  dependencies: { bar: { version: '1.0.0' } },
                },
              },
            },
          },
        },
        'should output json containing dev deps'
      )
      _flatOptions.dev = false
      t.end()
    })
  })

  t.test('--only=development', (t) => {
    _flatOptions.only = 'development'
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            'dev-dep': {
              version: '1.0.0',
              dependencies: {
                foo: {
                  version: '1.0.0',
                  dependencies: { bar: { version: '1.0.0' } },
                },
              },
            },
          },
        },
        'should output json containing only development deps'
      )
      _flatOptions.only = null
      t.end()
    })
  })

  t.test('--link', (t) => {
    _flatOptions.link = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
          'linked-dep': '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      'linked-dep': {
        'package.json': JSON.stringify({
          name: 'linked-dep',
          version: '1.0.0',
        }),
      },
      node_modules: {
        'linked-dep': t.fixture('symlink', '../linked-dep'),
        ...diffDepTypesNmFixture.node_modules,
      },
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            'linked-dep': {
              version: '1.0.0',
              resolved: 'file:../linked-dep',
            },
          },
        },
        'should output json containing linked deps'
      )
      _flatOptions.link = false
      t.end()
    })
  })

  t.test('--production', (t) => {
    _flatOptions.production = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            lorem: { version: '1.0.0' },
            'optional-dep': { version: '1.0.0' },
            'prod-dep': { version: '1.0.0', dependencies: { bar: { version: '2.0.0' } } },
          },
        },
        'should output json containing production deps'
      )
      _flatOptions.production = false
      t.end()
    })
  })

  t.test('--only=prod', (t) => {
    _flatOptions.only = 'prod'
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            lorem: { version: '1.0.0' },
            'optional-dep': { version: '1.0.0' },
            'prod-dep': { version: '1.0.0', dependencies: { bar: { version: '2.0.0' } } },
          },
        },
        'should output json containing only prod deps'
      )
      _flatOptions.only = null
      t.end()
    })
  })

  t.test('from lockfile', (t) => {
    prefix = t.testdir({
      node_modules: {
        '@isaacs': {
          'dedupe-tests-a': {
            'package.json': JSON.stringify({
              name: '@isaacs/dedupe-tests-a',
              version: '1.0.1',
            }),
            node_modules: {
              '@isaacs': {
                'dedupe-tests-b': {
                  name: '@isaacs/dedupe-tests-b',
                  version: '1.0.0',
                },
              },
            },
          },
          'dedupe-tests-b': {
            'package.json': JSON.stringify({
              name: '@isaacs/dedupe-tests-b',
              version: '2.0.0',
            }),
          },
        },
      },
      'package-lock.json': JSON.stringify({
        name: 'dedupe-lockfile',
        version: '1.0.0',
        lockfileVersion: 2,
        requires: true,
        packages: {
          '': {
            name: 'dedupe-lockfile',
            version: '1.0.0',
            dependencies: {
              '@isaacs/dedupe-tests-a': '1.0.1',
              '@isaacs/dedupe-tests-b': '1||2',
            },
          },
          'node_modules/@isaacs/dedupe-tests-a': {
            name: '@isaacs/dedupe-tests-a',
            version: '1.0.1',
            resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-a/-/dedupe-tests-a-1.0.1.tgz',
            integrity: 'sha512-8AN9lNCcBt5Xeje7fMEEpp5K3rgcAzIpTtAjYb/YMUYu8SbIVF6wz0WqACDVKvpQOUcSfNHZQNLNmue0QSwXOQ==',
            dependencies: {
              '@isaacs/dedupe-tests-b': '1',
            },
          },
          'node_modules/@isaacs/dedupe-tests-a/node_modules/@isaacs/dedupe-tests-b': {
            name: '@isaacs/dedupe-tests-b',
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-b/-/dedupe-tests-b-1.0.0.tgz',
            integrity: 'sha512-3nmvzIb8QL8OXODzipwoV3U8h9OQD9g9RwOPuSBQqjqSg9JZR1CCFOWNsDUtOfmwY8HFUJV9EAZ124uhqVxq+w==',
          },
          'node_modules/@isaacs/dedupe-tests-b': {
            name: '@isaacs/dedupe-tests-b',
            version: '2.0.0',
            resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-b/-/dedupe-tests-b-2.0.0.tgz',
            integrity: 'sha512-KTYkpRv9EzlmCg4Gsm/jpclWmRYFCXow8GZKJXjK08sIZBlElTZEa5Bw/UQxIvEfcKmWXczSqItD49Kr8Ax4UA==',
          },
        },
        dependencies: {
          '@isaacs/dedupe-tests-a': {
            version: '1.0.1',
            resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-a/-/dedupe-tests-a-1.0.1.tgz',
            integrity: 'sha512-8AN9lNCcBt5Xeje7fMEEpp5K3rgcAzIpTtAjYb/YMUYu8SbIVF6wz0WqACDVKvpQOUcSfNHZQNLNmue0QSwXOQ==',
            requires: {
              '@isaacs/dedupe-tests-b': '1',
            },
            dependencies: {
              '@isaacs/dedupe-tests-b': {
                version: '1.0.0',
                resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-b/-/dedupe-tests-b-1.0.0.tgz',
                integrity: 'sha512-3nmvzIb8QL8OXODzipwoV3U8h9OQD9g9RwOPuSBQqjqSg9JZR1CCFOWNsDUtOfmwY8HFUJV9EAZ124uhqVxq+w==',
              },
            },
          },
          '@isaacs/dedupe-tests-b': {
            version: '2.0.0',
            resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-b/-/dedupe-tests-b-2.0.0.tgz',
            integrity: 'sha512-KTYkpRv9EzlmCg4Gsm/jpclWmRYFCXow8GZKJXjK08sIZBlElTZEa5Bw/UQxIvEfcKmWXczSqItD49Kr8Ax4UA==',
          },
        },
      }),
      'package.json': JSON.stringify({
        name: 'dedupe-lockfile',
        version: '1.0.0',
        dependencies: {
          '@isaacs/dedupe-tests-a': '1.0.1',
          '@isaacs/dedupe-tests-b': '1||2',
        },
      }),
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          version: '1.0.0',
          name: 'dedupe-lockfile',
          dependencies: {
            '@isaacs/dedupe-tests-a': {
              version: '1.0.1',
              resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-a/-/dedupe-tests-a-1.0.1.tgz',
              dependencies: {
                '@isaacs/dedupe-tests-b': {
                  resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-b/-/dedupe-tests-b-1.0.0.tgz',
                  extraneous: true,
                  problems: [
                    'extraneous: @isaacs/dedupe-tests-b@ {CWD}/ls-ls-json-from-lockfile/node_modules/@isaacs/dedupe-tests-a/node_modules/@isaacs/dedupe-tests-b',
                  ],
                },
              },
            },
            '@isaacs/dedupe-tests-b': {
              version: '2.0.0',
              resolved: 'https://registry.npmjs.org/@isaacs/dedupe-tests-b/-/dedupe-tests-b-2.0.0.tgz',
            },
          },
          problems: [
            'extraneous: @isaacs/dedupe-tests-b@ {CWD}/ls-ls-json-from-lockfile/node_modules/@isaacs/dedupe-tests-a/node_modules/@isaacs/dedupe-tests-b',
          ],
        },
        'should output json containing only prod deps'
      )
      t.end()
    })
  })

  t.test('--long', (t) => {
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            'peer-dep': {
              name: 'peer-dep',
              description: 'Peer-dep description here',
              version: '1.0.0',
              _id: 'peer-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: {},
              path: '{CWD}/ls-ls-json--long/node_modules/peer-dep',
              extraneous: false,
            },
            'dev-dep': {
              name: 'dev-dep',
              description: 'A DEV dep kind of dep',
              version: '1.0.0',
              dependencies: {
                foo: {
                  name: 'foo',
                  version: '1.0.0',
                  dependencies: {
                    bar: {
                      name: 'bar',
                      version: '1.0.0',
                      _id: 'bar@1.0.0',
                      devDependencies: {},
                      peerDependencies: {},
                      _dependencies: {},
                      path: '{CWD}/ls-ls-json--long/node_modules/bar',
                      extraneous: false,
                    },
                  },
                  _id: 'foo@1.0.0',
                  devDependencies: {},
                  peerDependencies: {},
                  _dependencies: { bar: '^1.0.0' },
                  path: '{CWD}/ls-ls-json--long/node_modules/foo',
                  extraneous: false,
                },
              },
              _id: 'dev-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: { foo: '^1.0.0' },
              path: '{CWD}/ls-ls-json--long/node_modules/dev-dep',
              extraneous: false,
            },
            lorem: {
              name: 'lorem',
              version: '1.0.0',
              _id: 'lorem@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: {},
              path: '{CWD}/ls-ls-json--long/node_modules/lorem',
              extraneous: false,
            },
            'optional-dep': {
              name: 'optional-dep',
              description: 'Maybe a dep?',
              version: '1.0.0',
              _id: 'optional-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: {},
              path: '{CWD}/ls-ls-json--long/node_modules/optional-dep',
              extraneous: false,
            },
            'prod-dep': {
              name: 'prod-dep',
              description: 'A PROD dep kind of dep',
              version: '1.0.0',
              dependencies: {
                bar: {
                  name: 'bar',
                  description: 'A dep that bars',
                  version: '2.0.0',
                  _id: 'bar@2.0.0',
                  devDependencies: {},
                  peerDependencies: {},
                  _dependencies: {},
                  path: '{CWD}/ls-ls-json--long/node_modules/prod-dep/node_modules/bar',
                  extraneous: false,
                },
              },
              _id: 'prod-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: { bar: '^2.0.0' },
              path: '{CWD}/ls-ls-json--long/node_modules/prod-dep',
              extraneous: false,
            },
          },
          devDependencies: { 'dev-dep': '^1.0.0' },
          optionalDependencies: { 'optional-dep': '^1.0.0' },
          peerDependencies: { 'peer-dep': '^1.0.0' },
          _id: 'test-npm-ls@1.0.0',
          _dependencies: { 'prod-dep': '^1.0.0', lorem: '^1.0.0', 'optional-dep': '^1.0.0' },
          path: '{CWD}/ls-ls-json--long',
          extraneous: false,
        },
        'should output long json info'
      )
      _flatOptions.long = true
      t.end()
    })
  })

  t.test('--long --depth=0', (t) => {
    _flatOptions.all = false
    _flatOptions.depth = 0
    _flatOptions.long = true
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            'peer-dep': {
              name: 'peer-dep',
              description: 'Peer-dep description here',
              version: '1.0.0',
              _id: 'peer-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: {},
              path: '{CWD}/ls-ls-json--long-depth-0/node_modules/peer-dep',
              extraneous: false,
            },
            'dev-dep': {
              name: 'dev-dep',
              description: 'A DEV dep kind of dep',
              version: '1.0.0',
              _id: 'dev-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: { foo: '^1.0.0' },
              path: '{CWD}/ls-ls-json--long-depth-0/node_modules/dev-dep',
              extraneous: false,
            },
            lorem: {
              name: 'lorem',
              version: '1.0.0',
              _id: 'lorem@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: {},
              path: '{CWD}/ls-ls-json--long-depth-0/node_modules/lorem',
              extraneous: false,
            },
            'optional-dep': {
              name: 'optional-dep',
              description: 'Maybe a dep?',
              version: '1.0.0',
              _id: 'optional-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: {},
              path: '{CWD}/ls-ls-json--long-depth-0/node_modules/optional-dep',
              extraneous: false,
            },
            'prod-dep': {
              name: 'prod-dep',
              description: 'A PROD dep kind of dep',
              version: '1.0.0',
              _id: 'prod-dep@1.0.0',
              devDependencies: {},
              peerDependencies: {},
              _dependencies: { bar: '^2.0.0' },
              path: '{CWD}/ls-ls-json--long-depth-0/node_modules/prod-dep',
              extraneous: false,
            },
          },
          devDependencies: { 'dev-dep': '^1.0.0' },
          optionalDependencies: { 'optional-dep': '^1.0.0' },
          peerDependencies: { 'peer-dep': '^1.0.0' },
          _id: 'test-npm-ls@1.0.0',
          _dependencies: { 'prod-dep': '^1.0.0', lorem: '^1.0.0', 'optional-dep': '^1.0.0' },
          path: '{CWD}/ls-ls-json--long-depth-0',
          extraneous: false,
        },
        'should output json containing top-level deps in long format'
      )
      _flatOptions.all = true
      _flatOptions.depth = Infinity
      _flatOptions.long = false
      t.end()
    })
  })

  t.test('json read problems', (t) => {
    prefix = t.testdir({
      'package.json': '{broken json',
    })
    ls([], (err) => {
      t.match(err.message, 'Failed to parse root package.json', 'should have missin root package.json msg')
      t.match(err.code, 'EJSONPARSE', 'should have EJSONPARSE error code')
      t.deepEqual(
        jsonParse(result),
        {
          invalid: true,
          problems: [
            'error in {CWD}/ls-ls-json-json-read-problems: Failed to parse root package.json',
          ],
        },
        'should print empty json result'
      )
      t.end()
    })
  })

  t.test('empty location', (t) => {
    prefix = t.testdir({})
    ls([], (err) => {
      t.ifError(err, 'should not error out on empty locations')
      t.deepEqual(
        jsonParse(result),
        {},
        'should print empty json result'
      )
      t.end()
    })
  })

  t.test('unmet peer dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'optional-dep': '^1.0.0',
        },
        peerDependencies: {
          'peer-dep': '^2.0.0', // mismatching version #
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'Should have ELSPROBLEMS error code')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          problems: [
            'invalid: peer-dep@1.0.0 {CWD}/ls-ls-json-unmet-peer-dep/node_modules/peer-dep',
          ],
          dependencies: {
            'peer-dep': {
              version: '1.0.0',
              invalid: true,
              problems: [
                'invalid: peer-dep@1.0.0 {CWD}/ls-ls-json-unmet-peer-dep/node_modules/peer-dep',
              ],
            },
            'dev-dep': {
              version: '1.0.0',
              dependencies: {
                foo: {
                  version: '1.0.0',
                  dependencies: { bar: { version: '1.0.0' } },
                },
              },
            },
            lorem: { version: '1.0.0' },
            'optional-dep': { version: '1.0.0' },
            'prod-dep': { version: '1.0.0', dependencies: { bar: { version: '2.0.0' } } },
          },
        },
        'should output json signaling missing peer dep in problems'
      )
      t.end()
    })
  })

  t.test('unmet optional dep', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'prod-dep': '^1.0.0',
          lorem: '^1.0.0',
        },
        devDependencies: {
          'dev-dep': '^1.0.0',
        },
        optionalDependencies: {
          'missing-optional-dep': '^1.0.0',
          'optional-dep': '^2.0.0', // mismatching version #
        },
        peerDependencies: {
          'peer-dep': '^1.0.0',
        },
      }),
      ...diffDepTypesNmFixture,
    })
    ls([], (err) => {
      t.match(err.code, 'ELSPROBLEMS', 'should have ELSPROBLEMS error code')
      t.match(err.message, /invalid: optional-dep@1.0.0/, 'should have invalid dep error msg')
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          problems: [
            'invalid: optional-dep@1.0.0 {CWD}/ls-ls-json-unmet-optional-dep/node_modules/optional-dep', // mismatching optional deps get flagged in problems
          ],
          dependencies: {
            'optional-dep': {
              version: '1.0.0',
              invalid: true,
              problems: [
                'invalid: optional-dep@1.0.0 {CWD}/ls-ls-json-unmet-optional-dep/node_modules/optional-dep',
              ],
            },
            'peer-dep': {
              version: '1.0.0',
            },
            'dev-dep': {
              version: '1.0.0',
              dependencies: {
                foo: {
                  version: '1.0.0',
                  dependencies: { bar: { version: '1.0.0' } },
                },
              },
            },
            lorem: { version: '1.0.0' },
            'prod-dep': { version: '1.0.0', dependencies: { bar: { version: '2.0.0' } } },
            'missing-optional-dep': {}, // missing optional dep has an empty entry in json output
          },
        },
        'should output json with empty entry for missing optional deps'
      )
      t.end()
    })
  })

  t.test('cycle deps', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
            dependencies: {
              b: '^1.0.0',
            },
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            dependencies: {
              a: '^1.0.0',
            },
          }),
        },
      },
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            a: {
              version: '1.0.0',
              dependencies: {
                b: {
                  version: '1.0.0',
                  dependencies: {
                    a: { version: '1.0.0' },
                  },
                },
              },
            },
          },
        },
        'should print json output containing deduped ref'
      )
      t.end()
    })
  })

  t.test('using aliases', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          a: 'npm:b@1.0.0',
        },
      }),
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
            _from: 'a@npm:b',
            _resolved: 'https://localhost:8080/abbrev/-/abbrev-1.1.1.tgz',
            _requested: {
              type: 'alias',
            },
          }),
        },
      },
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            a: {
              version: '1.0.0',
              resolved: 'https://localhost:8080/abbrev/-/abbrev-1.1.1.tgz',
            },
          },
        },
        'should output json containing aliases'
      )
      t.end()
    })
  })

  t.test('resolved points to git ref', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          abbrev: 'git+https://github.com/isaacs/abbrev-js.git',
        },
      }),
      node_modules: {
        abbrev: {
          'package.json': JSON.stringify({
            name: 'abbrev',
            version: '1.1.1',
            _id: 'abbrev@1.1.1',
            _from: 'git+https://github.com/isaacs/abbrev-js.git',
            _resolved: 'git+https://github.com/isaacs/abbrev-js.git#b8f3a2fc0c3bb8ffd8b0d0072cc6b5a3667e963c',
            _requested: {
              type: 'git',
              raw: 'git+https:github.com/isaacs/abbrev-js.git',
              rawSpec: 'git+https:github.com/isaacs/abbrev-js.git',
              saveSpec: 'git+https://github.com/isaacs/abbrev-js.git',
              fetchSpec: 'https://github.com/isaacs/abbrev-js.git',
              gitCommittish: null,
            },
          }),
        },
      },
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            abbrev: {
              version: '1.1.1',
              resolved: 'git+ssh://git@github.com/isaacs/abbrev-js.git#b8f3a2fc0c3bb8ffd8b0d0072cc6b5a3667e963c',
            },
          },
        },
        'should output json containing git refs'
      )
      t.end()
    })
  })

  t.test('from and resolved properties', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        name: 'test-npm-ls',
        version: '1.0.0',
        dependencies: {
          'simple-output': '^2.0.0',
        },
      }),
      node_modules: {
        'simple-output': {
          'package.json': JSON.stringify({
            name: 'simple-output',
            version: '2.1.1',
            _from: 'simple-output',
            _id: 'simple-output@2.1.1',
            _resolved: 'https://registry.npmjs.org/simple-output/-/simple-output-2.1.1.tgz',
            _requested: {
              type: 'tag',
              registry: true,
              raw: 'simple-output',
              name: 'simple-output',
              escapedName: 'simple-output',
              rawSpec: '',
              saveSpec: null,
              fetchSpec: 'latest',
            },
            _requiredBy: [
              '#USER',
              '/',
            ],
            _shasum: '3c07708ec9ef3e3c985cf0ddd67df09ab8ec2abc',
            _spec: 'simple-output',
          }),
        },
      },
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          name: 'test-npm-ls',
          version: '1.0.0',
          dependencies: {
            'simple-output': {
              version: '2.1.1',
              resolved: 'https://registry.npmjs.org/simple-output/-/simple-output-2.1.1.tgz',
            },
          },
        },
        'should be printed in json output'
      )
      t.end()
    })
  })

  t.test('node.name fallback if missing root package name', (t) => {
    prefix = t.testdir({
      'package.json': JSON.stringify({
        version: '1.0.0',
      }),
    })
    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          version: '1.0.0',
          name: 'ls-ls-json-node-name-fallback-if-missing-root-package-name',
        },
        'should use node.name as key in json result obj'
      )
      t.end()
    })
  })

  t.test('global', (t) => {
    _flatOptions.global = true
    const fixtures = t.testdir({
      node_modules: {
        a: {
          'package.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
          }),
        },
        b: {
          'package.json': JSON.stringify({
            name: 'b',
            version: '1.0.0',
          }),
          node_modules: {
            c: {
              'package.json': JSON.stringify({
                name: 'c',
                version: '1.0.0',
              }),
            },
          },
        },
      },
    })

    // mimics lib/npm.js globalDir getter but pointing to fixtures
    globalDir = resolve(fixtures, 'node_modules')

    ls([], () => {
      t.deepEqual(
        jsonParse(result),
        {
          dependencies: {
            a: {
              version: '1.0.0',
            },
            b: {
              version: '1.0.0',
              dependencies: {
                c: {
                  version: '1.0.0',
                },
              },
            },
          },
        },
        'should print json output for global deps'
      )
      globalDir = 'MISSING_GLOBAL_DIR'
      _flatOptions.global = false
      t.end()
    })
  })

  t.end()
})
