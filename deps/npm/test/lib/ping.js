const { test } = require('tap')
const requireInject = require('require-inject')

test('pings', (t) => {
  t.plan(8)

  const flatOptions = { registry: 'https://registry.npmjs.org' }
  let noticeCalls = 0
  const ping = requireInject('../../lib/ping.js', {
    '../../lib/npm.js': { flatOptions },
    '../../lib/utils/ping.js': function (spec) {
      t.equal(spec, flatOptions, 'passes flatOptions')
      return {}
    },
    npmlog: {
      notice: (type, spec) => {
        ++noticeCalls
        if (noticeCalls === 1) {
          t.equal(type, 'PING', 'should log a PING')
          t.equal(spec, flatOptions.registry, 'should log the registry url')
        } else {
          t.equal(type, 'PONG', 'should log a PONG')
          t.match(spec, /\d+ms/, 'should log the elapsed milliseconds')
        }
      },
    },
  })

  ping([], (err) => {
    t.equal(noticeCalls, 2, 'should have logged 2 lines')
    t.ifError(err, 'npm ping')
    t.ok('should be able to ping')
  })
})

test('pings and logs details', (t) => {
  t.plan(10)

  const flatOptions = { registry: 'https://registry.npmjs.org' }
  const details = { extra: 'data' }
  let noticeCalls = 0
  const ping = requireInject('../../lib/ping.js', {
    '../../lib/npm.js': { flatOptions },
    '../../lib/utils/ping.js': function (spec) {
      t.equal(spec, flatOptions, 'passes flatOptions')
      return details
    },
    npmlog: {
      notice: (type, spec) => {
        ++noticeCalls
        if (noticeCalls === 1) {
          t.equal(type, 'PING', 'should log a PING')
          t.equal(spec, flatOptions.registry, 'should log the registry url')
        } else if (noticeCalls === 2) {
          t.equal(type, 'PONG', 'should log a PONG')
          t.match(spec, /\d+ms/, 'should log the elapsed milliseconds')
        } else {
          t.equal(type, 'PONG', 'should log a PONG')
          const parsed = JSON.parse(spec)
          t.match(parsed, details, 'should log JSON stringified details')
        }
      },
    },
  })

  ping([], (err) => {
    t.equal(noticeCalls, 3, 'should have logged 3 lines')
    t.ifError(err, 'npm ping')
    t.ok('should be able to ping')
  })
})

test('pings and returns json', (t) => {
  t.plan(11)

  const flatOptions = { registry: 'https://registry.npmjs.org', json: true }
  const details = { extra: 'data' }
  let noticeCalls = 0
  const ping = requireInject('../../lib/ping.js', {
    '../../lib/npm.js': { flatOptions },
    '../../lib/utils/ping.js': function (spec) {
      t.equal(spec, flatOptions, 'passes flatOptions')
      return details
    },
    '../../lib/utils/output.js': function (spec) {
      const parsed = JSON.parse(spec)
      t.equal(parsed.registry, flatOptions.registry, 'returns the correct registry url')
      t.match(parsed.details, details, 'prints returned details')
      t.type(parsed.time, 'number', 'returns time as a number')
    },
    npmlog: {
      notice: (type, spec) => {
        ++noticeCalls
        if (noticeCalls === 1) {
          t.equal(type, 'PING', 'should log a PING')
          t.equal(spec, flatOptions.registry, 'should log the registry url')
        } else {
          t.equal(type, 'PONG', 'should log a PONG')
          t.match(spec, /\d+ms/, 'should log the elapsed milliseconds')
        }
      },
    },
  })

  ping([], (err) => {
    t.equal(noticeCalls, 2, 'should have logged 2 lines')
    t.ifError(err, 'npm ping')
    t.ok('should be able to ping')
  })
})
