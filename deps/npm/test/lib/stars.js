const requireInject = require('require-inject')
const t = require('tap')

let result = ''

const noop = () => null
const npm = { config: { get () {} }, flatOptions: {} }
const npmFetch = { json: noop }
const npmlog = { warn: noop }
const mocks = {
  npmlog,
  'npm-registry-fetch': npmFetch,
  '../../lib/npm.js': npm,
  '../../lib/utils/output.js': (...msg) => {
    result = [result, ...msg].join('\n')
  },
  '../../lib/utils/get-identity.js': async () => 'foo',
  '../../lib/utils/usage.js': () => 'usage instructions',
}

const stars = requireInject('../../lib/stars.js', mocks)

t.afterEach(cb => {
  npm.config = { get () {} }
  npmlog.warn = noop
  result = ''
  cb()
})

t.test('no args', t => {
  npmFetch.json = async (uri, opts) => {
    t.equal(uri, '/-/_view/starredByUser', 'should fetch from expected uri')
    t.equal(opts.query.key, '"foo"', 'should match logged in username')

    return {
      rows: [
        { value: '@npmcli/arborist' },
        { value: '@npmcli/map-workspaces' },
        { value: 'libnpmfund' },
        { value: 'libnpmpublish' },
        { value: 'ipt' },
      ],
    }
  }

  stars([], err => {
    if (err)
      throw err

    t.matchSnapshot(
      result,
      'should output a list of starred packages'
    )

    t.end()
  })
})

t.test('npm star <user>', t => {
  t.plan(3)
  npmFetch.json = async (uri, opts) => {
    t.equal(uri, '/-/_view/starredByUser', 'should fetch from expected uri')
    t.equal(opts.query.key, '"ruyadorno"', 'should match username')

    return {
      rows: [{ value: '@npmcli/arborist' }],
    }
  }

  stars(['ruyadorno'], err => {
    if (err)
      throw err

    t.match(
      result,
      '@npmcli/arborist',
      'should output expected list of starred packages'
    )
  })
})

t.test('unauthorized request', t => {
  t.plan(4)
  npmFetch.json = async () => {
    throw Object.assign(
      new Error('Not logged in'),
      { code: 'ENEEDAUTH' }
    )
  }

  npmlog.warn = (title, msg) => {
    t.equal(title, 'stars', 'should use expected title')
    t.equal(
      msg,
      'auth is required to look up your username',
      'should warn auth required msg'
    )
  }

  stars([], err => {
    t.match(
      err,
      /Not logged in/,
      'should throw unauthorized request msg'
    )

    t.equal(
      result,
      '',
      'should have empty output'
    )
  })
})

t.test('unexpected error', t => {
  npmFetch.json = async () => {
    throw new Error('ERROR')
  }

  npmlog.warn = (title, msg) => {
    throw new Error('Should not output extra warning msgs')
  }

  stars([], err => {
    t.match(
      err,
      /ERROR/,
      'should throw unexpected error message'
    )
    t.end()
  })
})

t.test('no pkg starred', t => {
  t.plan(2)
  npmFetch.json = async (uri, opts) => ({ rows: [] })

  npmlog.warn = (title, msg) => {
    t.equal(title, 'stars', 'should use expected title')
    t.equal(
      msg,
      'user has not starred any packages',
      'should warn no starred packages msg'
    )
  }

  stars([], err => {
    if (err)
      throw err
  })
})
