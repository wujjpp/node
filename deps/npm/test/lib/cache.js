const t = require('tap')
const requireInject = require('require-inject')
const path = require('path')

const usageUtil = () => 'usage instructions'

const flatOptions = {
  force: false,
}

const npm = {
  flatOptions,
  cache: '/fake/path',
}

let rimrafPath = ''
const rimraf = (path, cb) => {
  rimrafPath = path
  return cb()
}

let logOutput = []
const npmlog = {
  silly: (...args) => {
    logOutput.push(['silly', ...args])
  },
}

let tarballStreamSpec = ''
let tarballStreamOpts = {}
const pacote = {
  tarball: {
    stream: (spec, handler, opts) => {
      tarballStreamSpec = spec
      tarballStreamOpts = opts
      return handler({
        resume: () => {},
        promise: () => Promise.resolve(),
      })
    },
  },
}

let outputOutput = []
const output = (msg) => {
  outputOutput.push(msg)
}

const cacacheVerifyStats = {
  keptSize: 100,
  verifiedContent: 1,
  totalEntries: 1,
  runTime: { total: 2000 },
}
const cacache = {
  verify: (path) => {
    return cacacheVerifyStats
  },
}

const mocks = {
  cacache,
  npmlog,
  pacote,
  rimraf,
  '../../lib/npm.js': npm,
  '../../lib/utils/output.js': output,
  '../../lib/utils/usage.js': usageUtil,
}

const cache = requireInject('../../lib/cache.js', mocks)

t.test('cache no args', t => {
  cache([], err => {
    t.equal(err.message, 'usage instructions', 'should throw usage instructions')
    t.end()
  })
})

t.test('cache clean', t => {
  cache(['clean'], err => {
    t.match(err.message, 'the npm cache self-heals', 'should throw warning')
    t.end()
  })
})

t.test('cache clean (force)', t => {
  flatOptions.force = true
  t.teardown(() => {
    rimrafPath = ''
    flatOptions.force = false
  })

  cache(['clear'], err => {
    t.ifError(err)
    t.equal(rimrafPath, path.join(npm.cache, '_cacache'))
    t.end()
  })
})

t.test('cache clean with arg', t => {
  cache(['rm', 'pkg'], err => {
    t.match(err.message, 'does not accept arguments', 'should throw error')
    t.end()
  })
})

t.test('cache add no arg', t => {
  t.teardown(() => {
    logOutput = []
  })

  cache(['add'], err => {
    t.strictSame(logOutput, [
      ['silly', 'cache add', 'args', []],
    ], 'logs correctly')
    t.equal(err.code, 'EUSAGE', 'throws usage error')
    t.end()
  })
})

t.test('cache add pkg only', t => {
  t.teardown(() => {
    logOutput = []
    tarballStreamSpec = ''
    tarballStreamOpts = {}
  })

  cache(['add', 'mypkg'], err => {
    t.ifError(err)
    t.strictSame(logOutput, [
      ['silly', 'cache add', 'args', ['mypkg']],
      ['silly', 'cache add', 'spec', 'mypkg'],
    ], 'logs correctly')
    t.equal(tarballStreamSpec, 'mypkg', 'passes the correct spec to pacote')
    t.same(tarballStreamOpts, flatOptions, 'passes the correct options to pacote')
    t.end()
  })
})

t.test('cache add pkg w/ spec modifier', t => {
  t.teardown(() => {
    logOutput = []
    tarballStreamSpec = ''
    tarballStreamOpts = {}
  })

  cache(['add', 'mypkg', 'latest'], err => {
    t.ifError(err)
    t.strictSame(logOutput, [
      ['silly', 'cache add', 'args', ['mypkg', 'latest']],
      ['silly', 'cache add', 'spec', 'mypkg@latest'],
    ], 'logs correctly')
    t.equal(tarballStreamSpec, 'mypkg@latest', 'passes the correct spec to pacote')
    t.same(tarballStreamOpts, flatOptions, 'passes the correct options to pacote')
    t.end()
  })
})

t.test('cache verify', t => {
  t.teardown(() => {
    outputOutput = []
  })

  cache(['verify'], err => {
    t.ifError(err)
    t.match(outputOutput, [
      `Cache verified and compressed (${path.join(npm.cache, '_cacache')})`,
      'Content verified: 1 (100 bytes)',
      'Index entries: 1',
      'Finished in 2s',
    ], 'prints correct output')
    t.end()
  })
})

t.test('cache verify w/ extra output', t => {
  npm.cache = `${process.env.HOME}/fake/path`
  cacacheVerifyStats.badContentCount = 1
  cacacheVerifyStats.reclaimedCount = 2
  cacacheVerifyStats.reclaimedSize = 200
  cacacheVerifyStats.missingContent = 3
  t.teardown(() => {
    npm.cache = '/fake/path'
    outputOutput = []
    delete cacacheVerifyStats.badContentCount
    delete cacacheVerifyStats.reclaimedCount
    delete cacacheVerifyStats.reclaimedSize
    delete cacacheVerifyStats.missingContent
  })

  cache(['check'], err => {
    t.ifError(err)
    t.match(outputOutput, [
      `Cache verified and compressed (~${path.join('/fake/path', '_cacache')})`,
      'Content verified: 1 (100 bytes)',
      'Corrupted content removed: 1',
      'Content garbage-collected: 2 (200 bytes)',
      'Missing content: 3',
      'Index entries: 1',
      'Finished in 2s',
    ], 'prints correct output')
    t.end()
  })
})

t.test('cache completion', t => {
  const { completion } = cache

  const testComp = (argv, expect) => {
    completion({ conf: { argv: { remain: argv } } }, (err, res) => {
      t.ifError(err)
      t.strictSame(res, expect, argv.join(' '))
    })
  }

  testComp(['npm', 'cache'], [
    'add',
    'clean',
    'verify',
  ])

  testComp(['npm', 'cache', 'add'], [])
  testComp(['npm', 'cache', 'clean'], [])
  testComp(['npm', 'cache', 'verify'], [])

  t.end()
})
