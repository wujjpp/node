const t = require('tap')

const requireInject = require('require-inject')
const pacote = {
  manifest: async (spec, options) => {
    return spec === 'nobugs' ? {
      name: 'nobugs',
      version: '1.2.3',
    }
      : spec === 'bugsurl' ? {
        name: 'bugsurl',
        version: '1.2.3',
        bugs: 'https://bugzilla.localhost/bugsurl',
      }
      : spec === 'bugsobj' ? {
        name: 'bugsobj',
        version: '1.2.3',
        bugs: { url: 'https://bugzilla.localhost/bugsobj' },
      }
      : spec === 'bugsobj-nourl' ? {
        name: 'bugsobj-nourl',
        version: '1.2.3',
        bugs: { no: 'url here' },
      }
      : spec === 'repourl' ? {
        name: 'repourl',
        version: '1.2.3',
        repository: 'https://github.com/foo/repourl',
      }
      : spec === 'repoobj' ? {
        name: 'repoobj',
        version: '1.2.3',
        repository: { url: 'https://github.com/foo/repoobj' },
      }
      : spec === '.' ? {
        name: 'thispkg',
        version: '1.2.3',
        bugs: 'https://example.com',
      }
      : null
  },
}

// keep a tally of which urls got opened
const opened = {}
const openUrl = (url, errMsg, cb) => {
  opened[url] = opened[url] || 0
  opened[url]++
  process.nextTick(cb)
}

const bugs = requireInject('../../lib/bugs.js', {
  pacote,
  '../../lib/utils/open-url.js': openUrl,
})

t.test('completion', t => {
  bugs.completion({}, (er, res) => {
    t.equal(er, null)
    t.same(res, [])
    t.end()
  })
})

t.test('open bugs urls', t => {
  const expect = {
    nobugs: 'https://www.npmjs.com/package/nobugs',
    'bugsobj-nourl': 'https://www.npmjs.com/package/bugsobj-nourl',
    bugsurl: 'https://bugzilla.localhost/bugsurl',
    bugsobj: 'https://bugzilla.localhost/bugsobj',
    repourl: 'https://github.com/foo/repourl/issues',
    repoobj: 'https://github.com/foo/repoobj/issues',
    '.': 'https://example.com',
  }
  const keys = Object.keys(expect)
  t.plan(keys.length)
  keys.forEach(pkg => {
    t.test(pkg, t => {
      bugs([pkg], (er) => {
        if (er)
          throw er
        t.equal(opened[expect[pkg]], 1, 'opened expected url', {opened})
        t.end()
      })
    })
  })
})

t.test('open default package if none specified', t => {
  bugs([], (er) => {
    if (er)
      throw er
    t.equal(opened['https://example.com'], 2, 'opened expected url', {opened})
    t.end()
  })
})
