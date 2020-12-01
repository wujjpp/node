const t = require('tap')
const requireInject = require('require-inject')

let logs
const cleanLogs = (done) => {
  logs = ''
  const fn = (...args) => {
    logs += '\n'
    args.map(el => logs += el)
  }
  console.log = fn
  done()
}

const packument = (nv, opts) => {
  if (!opts.fullMetadata)
    throw new Error('must fetch fullMetadata')

  if (!opts.preferOnline)
    throw new Error('must fetch with preferOnline')

  const mocks = {
    red: {
      name: 'red',
      'dist-tags': {
        '1.0.1': {},
      },
      time: {
        unpublished: new Date(),
      },
    },
    blue: {
      name: 'blue',
      'dist-tags': {},
      time: {
        '1.0.0': '2019-08-06T16:21:09.842Z',
      },
      versions: {
        '1.0.0': {
          name: 'blue',
          version: '1.0.0',
          dist: {
            shasum: '123',
            tarball: 'http://hm.blue.com/1.0.0.tgz',
            integrity: '---',
            fileCount: 1,
            unpackedSize: 1,
          },
        },
        '1.0.1': {},
      },
    },
    cyan: {
      _npmUser: {
        name: 'claudia',
        email: 'claudia@cyan.com',
      },
      name: 'cyan',
      'dist-tags': {},
      versions: {
        '1.0.0': {
          version: '1.0.0',
          name: 'cyan',
          dist: {
            shasum: '123',
            tarball: 'http://hm.cyan.com/1.0.0.tgz',
            integrity: '---',
            fileCount: 1,
            unpackedSize: 1,
          },
        },
        '1.0.1': {},
      },
    },
    brown: {
      name: 'brown',
    },
    yellow: {
      _id: 'yellow',
      name: 'yellow',
      author: {
        name: 'foo',
        email: 'foo@yellow.com',
        twitter: 'foo',
      },
      readme: 'a very useful readme',
      versions: {
        '1.0.0': {
          version: '1.0.0',
          author: 'claudia',
          readme: 'a very useful readme',
          maintainers: [
            { name: 'claudia', email: 'c@yellow.com', twitter: 'cyellow' },
            { name: 'isaacs', email: 'i@yellow.com', twitter: 'iyellow' },
          ],
        },
        '1.0.1': {
          version: '1.0.1',
          author: 'claudia',
        },
        '1.0.2': {
          version: '1.0.2',
          author: 'claudia',
        },
      },
    },
    purple: {
      name: 'purple',
      versions: {
        '1.0.0': {
          foo: 1,
          maintainers: [
            { name: 'claudia' },
          ],
        },
        '1.0.1': {},
      },
    },
    green: {
      _id: 'green',
      name: 'green',
      'dist-tags': {
        latest: '1.0.0',
      },
      maintainers: [
        { name: 'claudia', email: 'c@yellow.com', twitter: 'cyellow' },
        { name: 'isaacs', email: 'i@yellow.com', twitter: 'iyellow' },
      ],
      keywords: ['colors', 'green', 'crayola'],
      versions: {
        '1.0.0': {
          _id: 'green',
          version: '1.0.0',
          description: 'green is a very important color',
          bugs: {
            url: 'http://bugs.green.com',
          },
          deprecated: true,
          repository: {
            url: 'http://repository.green.com',
          },
          license: { type: 'ACME' },
          bin: {
            green: 'bin/green.js',
          },
          dependencies: {
            red: '1.0.0',
            yellow: '1.0.0',
          },
          dist: {
            shasum: '123',
            tarball: 'http://hm.green.com/1.0.0.tgz',
            integrity: '---',
            fileCount: 1,
            unpackedSize: 1,
          },
        },
        '1.0.1': {},
      },
    },
    black: {
      name: 'black',
      'dist-tags': {
        latest: '1.0.0',
      },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          bugs: 'http://bugs.black.com',
          license: {},
          dependencies: (() => {
            const deps = {}
            for (let i = 0; i < 25; i++)
              deps[i] = '1.0.0'

            return deps
          })(),
          dist: {
            shasum: '123',
            tarball: 'http://hm.black.com/1.0.0.tgz',
            integrity: '---',
            fileCount: 1,
            unpackedSize: 1,
          },
        },
        '1.0.1': {},
      },
    },
    pink: {
      name: 'pink',
      'dist-tags': {
        latest: '1.0.0',
      },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          maintainers: [
            { name: 'claudia', url: 'http://c.pink.com' },
            { name: 'isaacs', url: 'http://i.pink.com' },
          ],
          repository: 'http://repository.pink.com',
          license: {},
          dist: {
            shasum: '123',
            tarball: 'http://hm.pink.com/1.0.0.tgz',
            integrity: '---',
            fileCount: 1,
            unpackedSize: 1,
          },
        },
        '1.0.1': {},
      },
    },
    orange: {
      name: 'orange',
      'dist-tags': {
        latest: '1.0.0',
      },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          homepage: 'http://hm.orange.com',
          license: {},
          dist: {
            shasum: '123',
            tarball: 'http://hm.orange.com/1.0.0.tgz',
            integrity: '---',
            fileCount: 1,
            unpackedSize: 1,
          },
        },
        '1.0.1': {},
      },
    },
  }
  return mocks[nv.name]
}

t.beforeEach(cleanLogs)
t.test('should log package info', t => {
  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        global: false,
      },
    },
    pacote: {
      packument,
    },
  })

  const viewJson = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        json: true,
      },
    },
    pacote: {
      packument,
    },
  })

  const viewUnicode = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        global: false,
        unicode: true,
      },
    },
    pacote: {
      packument,
    },
  })

  t.test('package with license, bugs, repository and other fields', t => {
    view(['green@1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('package with more than 25 deps', t => {
    view(['black@1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('package with maintainers info as object', t => {
    view(['pink@1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('package with homepage', t => {
    view(['orange@1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('package with no versions', t => {
    view(['brown'], () => {
      t.equals(logs, '', 'no info to display')
      t.end()
    })
  })

  t.test('package with no repo or homepage', t => {
    view(['blue@1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('package with no modified time', t => {
    viewUnicode(['cyan@1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('package with --json and semver range', t => {
    viewJson(['cyan@^1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('package with --json and no versions', t => {
    viewJson(['brown'], () => {
      t.equals(logs, '', 'no info to display')
      t.end()
    })
  })

  t.end()
})

t.test('should log info of package in current working dir', t => {
  const testDir = t.testdir({
    'package.json': JSON.stringify({
      name: 'blue',
      version: '1.0.0',
    }, null, 2),
  })

  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      prefix: testDir,
      flatOptions: {
        defaultTag: '1.0.0',
        global: false,
      },
    },
    pacote: {
      packument,
    },
  })

  t.test('specific version', t => {
    view(['.@1.0.0'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('non-specific version', t => {
    view(['.'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.end()
})

t.test('should log info by field name', t => {
  const viewJson = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        json: true,
        global: false,
      },
    },
    pacote: {
      packument,
    },
  })

  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        global: false,
      },
    },
    pacote: {
      packument,
    },
  })

  t.test('readme', t => {
    view(['yellow@1.0.0', 'readme'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('several fields', t => {
    viewJson(['yellow@1.0.0', 'name', 'version', 'foo[bar]'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('several fields with several versions', t => {
    view(['yellow@1.x.x', 'author'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('nested field with brackets', t => {
    viewJson(['orange@1.0.0', 'dist[shasum]'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('maintainers with email', t => {
    viewJson(['yellow@1.0.0', 'maintainers', 'name'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('maintainers with url', t => {
    viewJson(['pink@1.0.0', 'maintainers'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('unknown nested field ', t => {
    view(['yellow@1.0.0', 'dist.foobar'], () => {
      t.equals(logs, '', 'no info to display')
      t.end()
    })
  })

  t.test('array field - 1 element', t => {
    view(['purple@1.0.0', 'maintainers.name'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.test('array field - 2 elements', t => {
    view(['yellow@1.x.x', 'maintainers.name'], () => {
      t.matchSnapshot(logs)
      t.end()
    })
  })

  t.end()
})

t.test('throw error if global mode', (t) => {
  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        global: true,
      },
    },
  })
  view([], (err) => {
    t.equals(err.message, 'Cannot use view command in global mode.')
    t.end()
  })
})

t.test('throw ENOENT error if package.json misisng', (t) => {
  const testDir = t.testdir({})

  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      prefix: testDir,
      flatOptions: {
        global: false,
      },
    },
  })
  view([], (err) => {
    t.match(err, { code: 'ENOENT' })
    t.end()
  })
})

t.test('throw EJSONPARSE error if package.json not json', (t) => {
  const testDir = t.testdir({
    'package.json': 'not json, nope, not even a little bit!',
  })

  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      prefix: testDir,
      flatOptions: {
        global: false,
      },
    },
  })
  view([], (err) => {
    t.match(err, { code: 'EJSONPARSE' })
    t.end()
  })
})

t.test('throw error if package.json has no name', (t) => {
  const testDir = t.testdir({
    'package.json': '{}',
  })

  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      prefix: testDir,
      flatOptions: {
        global: false,
      },
    },
  })
  view([], (err) => {
    t.equals(err.message, 'Invalid package.json, no "name" field')
    t.end()
  })
})

t.test('throws when unpublished', (t) => {
  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        defaultTag: '1.0.1',
        global: false,
      },
    },
    pacote: {
      packument,
    },
  })
  view(['red'], (err) => {
    t.equals(err.code, 'E404')
    t.end()
  })
})

t.test('completion', (t) => {
  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        defaultTag: '1.0.1',
        global: false,
      },
    },
    pacote: {
      packument,
    },
  })
  view.completion({
    conf: { argv: { remain: ['npm', 'view', 'green@1.0.0'] } },
  }, (err, res) => {
    if (err)
      throw err
    t.ok(res, 'returns back fields')
    t.end()
  })
})

t.test('no registry completion', (t) => {
  const view = requireInject('../../lib/view.js', {
    '../../lib/npm.js': {
      flatOptions: {
        defaultTag: '1.0.1',
      },
    },
  })
  view.completion({
    conf: { argv: { remain: ['npm', 'view'] } },
  }, (err) => {
    t.notOk(err, 'there is no package completion')
    t.end()
  })
})
