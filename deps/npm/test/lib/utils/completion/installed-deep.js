const { resolve } = require('path')
const { test } = require('tap')
const requireInject = require('require-inject')

let prefix
let globalDir = 'MISSING_GLOBAL_DIR'
const _flatOptions = {
  depth: Infinity,
  global: false,
  get prefix () {
    return prefix
  },
}
const installedDeep = requireInject('../../../../lib/utils/completion/installed-deep.js', {
  '../../../../lib/npm.js': {
    flatOptions: _flatOptions,
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
})

const fixture = {
  'package.json': JSON.stringify({
    name: 'test-installed-deep',
    version: '1.0.0',
    dependencies: {
      a: '^1.0.0',
      b: '^1.0.0',
      c: '^1.0.0',
    },
    devDependencies: {
      d: '^1.0.0',
    },
    peerDependencies: {
      e: '^1.0.0',
    },
  }),
  node_modules: {
    a: {
      'package.json': JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: {
          f: '^1.0.0',
        },
      }),
    },
    b: {
      'package.json': JSON.stringify({
        name: 'b',
        version: '1.0.0',
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
    f: {
      'package.json': JSON.stringify({
        name: 'f',
        version: '1.0.0',
        dependencies: {
          g: '^1.0.0',
          e: '^2.0.0',
        },
      }),
      node_modules: {
        e: {
          'package.json': JSON.stringify({
            name: 'e',
            version: '2.0.0',
            dependencies: {
              bb: '^1.0.0',
            },
          }),
          node_modules: {
            bb: {
              'package.json': JSON.stringify({
                name: 'bb',
                version: '1.0.0',
              }),
            },
          },
        },
      },
    },
    g: {
      'package.json': JSON.stringify({
        name: 'g',
        version: '1.0.0',
      }),
    },
  },
}

const globalFixture = {
  node_modules: {
    foo: {
      'package.json': JSON.stringify({
        name: 'foo',
        version: '1.0.0',
      }),
    },
    bar: {
      'package.json': JSON.stringify({
        name: 'bar',
        version: '1.0.0',
        dependencies: {
          'a-bar': '^1.0.0',
        },
      }),
      node_modules: {
        'a-bar': {
          'package.json': JSON.stringify({
            name: 'a-bar',
            version: '1.0.0',
          }),
        },
      },
    },
  },
}

test('get list of package names', (t) => {
  const fix = t.testdir({
    local: fixture,
    global: globalFixture,
  })

  prefix = resolve(fix, 'local')
  globalDir = resolve(fix, 'global/node_modules')

  installedDeep(null, (err, res) => {
    t.ifError(err, 'should not error out')
    t.deepEqual(
      res,
      [
        ['bar', '-g'],
        ['foo', '-g'],
        ['a-bar', '-g'],
        'a', 'b', 'c',
        'd', 'e', 'f',
        'g', 'bb',
      ],
      'should return list of package names and global flag'
    )
    t.end()
  })
})

test('get list of package names as global', (t) => {
  const fix = t.testdir({
    local: fixture,
    global: globalFixture,
  })

  prefix = resolve(fix, 'local')
  globalDir = resolve(fix, 'global/node_modules')

  _flatOptions.global = true

  installedDeep(null, (err, res) => {
    t.ifError(err, 'should not error out')
    t.deepEqual(
      res,
      [
        'bar',
        'foo',
        'a-bar',
      ],
      'should return list of global packages with no extra flags'
    )
    _flatOptions.global = false
    t.end()
  })
})

test('limit depth', (t) => {
  const fix = t.testdir({
    local: fixture,
    global: globalFixture,
  })

  prefix = resolve(fix, 'local')
  globalDir = resolve(fix, 'global/node_modules')

  _flatOptions.depth = 0

  installedDeep(null, (err, res) => {
    t.ifError(err, 'should not error out')
    t.deepEqual(
      res,
      [
        ['bar', '-g'],
        ['foo', '-g'],
        'a', 'b',
        'c', 'd',
        'e', 'f',
        'g',
      ],
      'should print only packages up to the specified depth'
    )
    _flatOptions.depth = 0
    t.end()
  })
})

test('limit depth as global', (t) => {
  const fix = t.testdir({
    local: fixture,
    global: globalFixture,
  })

  prefix = resolve(fix, 'local')
  globalDir = resolve(fix, 'global/node_modules')

  _flatOptions.global = true
  _flatOptions.depth = 0

  installedDeep(null, (err, res) => {
    t.ifError(err, 'should not error out')
    t.deepEqual(
      res,
      [
        'bar',
        'foo',
      ],
      'should reorder so that packages above that level depth goes last'
    )
    _flatOptions.global = false
    _flatOptions.depth = 0
    t.end()
  })
})
