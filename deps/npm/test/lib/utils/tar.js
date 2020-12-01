const { test } = require('tap')
const pack = require('libnpmpack')
const ssri = require('ssri')
const requireInject = require('require-inject')

const { logTar, getContents } = require('../../../lib/utils/tar.js')

const printLogs = (tarball, unicode) => {
  const logs = []
  logTar(tarball, {
    log: {
      notice: (...args) => {
        args.map(el => logs.push(el))
      },
    },
    unicode,
  })
  return logs.join('\n')
}

test('should log tarball contents', async (t) => {
  const testDir = t.testdir({
    'package.json': JSON.stringify({
      name: 'my-cool-pkg',
      version: '1.0.0',
      bundleDependencies: [
        'bundle-dep',
      ],
    }, null, 2),
    node_modules: {
      'bundle-dep': 'toto',
    },
  })

  const tarball = await pack(testDir)
  const tarballContents = await getContents({
    _id: '1',
    name: 'my-cool-pkg',
    version: '1.0.0',
  }, tarball)

  t.matchSnapshot(printLogs(tarballContents, false))
})

test('should log tarball contents with unicode', async (t) => {
  const { logTar } = requireInject('../../../lib/utils/tar.js', {
    npmlog: {
      notice: (str) => {
        t.ok(true, 'defaults to npmlog')
        return str
      },
    },
  })

  logTar({
    files: [],
    bundled: [],
    integrity: '',
  }, { unicode: true })
  t.end()
})

test('should default to npmlog', async (t) => {
  const { logTar } = requireInject('../../../lib/utils/tar.js', {
    npmlog: {
      notice: (str) => {
        t.ok(true, 'defaults to npmlog')
        return str
      },
    },
  })

  logTar({
    files: [],
    bundled: [],
    integrity: '',
  })
  t.end()
})

test('should getContents of a tarball', async (t) => {
  const testDir = t.testdir({
    'package.json': JSON.stringify({
      name: 'my-cool-pkg',
      version: '1.0.0',
    }, null, 2),
  })

  const tarball = await pack(testDir)

  const tarballContents = await getContents({
    name: 'my-cool-pkg',
    version: '1.0.0',
  }, tarball)

  const integrity = await ssri.fromData(tarball, {
    algorithms: ['sha1', 'sha512'],
  })

  t.strictSame(tarballContents, {
    id: 'my-cool-pkg@1.0.0',
    name: 'my-cool-pkg',
    version: '1.0.0',
    size: 149,
    unpackedSize: 49,
    shasum: 'c0bfd67a5142104e429afda09119eedd6a30d2fc',
    integrity: ssri.parse(integrity.sha512[0]),
    filename: 'my-cool-pkg-1.0.0.tgz',
    files: [{ path: 'package.json', size: 49, mode: 420 }],
    entryCount: 1,
    bundled: [],
  }, 'contents are correct')
  t.end()
})
