const t = require('tap')
const requireInject = require('require-inject')

const RUN_SCRIPTS = []
const npm = {
  localPrefix: __dirname,
  flatOptions: {
    scriptShell: undefined,
    json: false,
    parseable: false,
  },
  config: {
    settings: {
      'if-present': false,
    },
    get: k => npm.config.settings[k],
    set: (k, v) => {
      npm.config.settings[k] = v
    },
  },
}

const output = []

const npmlog = { level: 'warn' }
const getRS = windows => requireInject('../../lib/run-script.js', {
  '@npmcli/run-script': Object.assign(async opts => {
    RUN_SCRIPTS.push(opts)
  }, {
    isServerPackage: require('@npmcli/run-script').isServerPackage,
  }),
  npmlog,
  '../../lib/npm.js': npm,
  '../../lib/utils/is-windows-shell.js': windows,
  '../../lib/utils/output.js': (...msg) => output.push(msg),
})

const runScript = getRS(false)
const runScriptWin = getRS(true)

const { writeFileSync } = require('fs')
t.test('completion', t => {
  const dir = t.testdir()
  npm.localPrefix = dir
  t.test('already have a script name', t => {
    runScript.completion({conf: {argv: {remain: ['npm', 'run', 'x']}}}, (er, results) => {
      if (er)
        throw er

      t.equal(results, undefined)
      t.end()
    })
  })
  t.test('no package.json', t => {
    runScript.completion({conf: {argv: {remain: ['npm', 'run']}}}, (er, results) => {
      if (er)
        throw er

      t.strictSame(results, [])
      t.end()
    })
  })
  t.test('has package.json, no scripts', t => {
    writeFileSync(`${dir}/package.json`, JSON.stringify({}))
    runScript.completion({conf: {argv: {remain: ['npm', 'run']}}}, (er, results) => {
      if (er)
        throw er

      t.strictSame(results, [])
      t.end()
    })
  })
  t.test('has package.json, with scripts', t => {
    writeFileSync(`${dir}/package.json`, JSON.stringify({
      scripts: { hello: 'echo hello', world: 'echo world' },
    }))
    runScript.completion({conf: {argv: {remain: ['npm', 'run']}}}, (er, results) => {
      if (er)
        throw er

      t.strictSame(results, ['hello', 'world'])
      t.end()
    })
  })
  t.end()
})

t.test('fail if no package.json', async t => {
  npm.localPrefix = t.testdir()
  await runScript([], er => t.match(er, { code: 'ENOENT' }))
  await runScript(['test'], er => t.match(er, { code: 'ENOENT' }))
})

t.test('default env, start, and restart scripts', async t => {
  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({ name: 'x', version: '1.2.3' }),
    'server.js': 'console.log("hello, world")',
  })

  await runScript(['start'], er => {
    if (er)
      throw er

    t.match(RUN_SCRIPTS, [
      {
        path: npm.localPrefix,
        args: [],
        scriptShell: undefined,
        stdio: 'inherit',
        stdioString: true,
        pkg: { name: 'x', version: '1.2.3', _id: 'x@1.2.3', scripts: {}},
        event: 'start',
      },
    ])
  })
  RUN_SCRIPTS.length = 0

  await runScript(['env'], er => {
    if (er)
      throw er

    t.match(RUN_SCRIPTS, [
      {
        path: npm.localPrefix,
        args: [],
        scriptShell: undefined,
        stdio: 'inherit',
        stdioString: true,
        pkg: { name: 'x',
          version: '1.2.3',
          _id: 'x@1.2.3',
          scripts: {
            env: 'env',
          } },
        event: 'env',
      },
    ])
  })
  RUN_SCRIPTS.length = 0

  await runScriptWin(['env'], er => {
    if (er)
      throw er

    t.match(RUN_SCRIPTS, [
      {
        path: npm.localPrefix,
        args: [],
        scriptShell: undefined,
        stdio: 'inherit',
        stdioString: true,
        pkg: { name: 'x',
          version: '1.2.3',
          _id: 'x@1.2.3',
          scripts: {
            env: 'SET',
          } },
        event: 'env',
      },
    ])
  })
  RUN_SCRIPTS.length = 0

  await runScript(['restart'], er => {
    if (er)
      throw er

    t.match(RUN_SCRIPTS, [
      {
        path: npm.localPrefix,
        args: [],
        scriptShell: undefined,
        stdio: 'inherit',
        stdioString: true,
        pkg: { name: 'x',
          version: '1.2.3',
          _id: 'x@1.2.3',
          scripts: {
            restart: 'npm stop --if-present && npm start',
          } },
        event: 'restart',
      },
    ])
  })
  RUN_SCRIPTS.length = 0
})

t.test('try to run missing script', t => {
  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      scripts: { hello: 'world' },
    }),
  })
  t.test('no suggestions', async t => {
    await runScript(['notevenclose'], er => {
      t.match(er, {
        message: 'missing script: notevenclose',
      })
    })
  })
  t.test('suggestions', async t => {
    await runScript(['helo'], er => {
      t.match(er, {
        message: 'missing script: helo\n\nDid you mean this?\n    hello',
      })
    })
  })
  t.test('with --if-present', async t => {
    npm.config.set('if-present', true)
    await runScript(['goodbye'], er => {
      if (er)
        throw er

      t.strictSame(RUN_SCRIPTS, [], 'did not try to run anything')
    })
  })
  t.end()
})

t.test('run pre/post hooks', async t => {
  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      name: 'x',
      version: '1.2.3',
      scripts: {
        preenv: 'echo before the env',
        postenv: 'echo after the env',
      },
    }),
  })

  await runScript(['env'], er => {
    if (er)
      throw er

    t.match(RUN_SCRIPTS, [
      { event: 'preenv' },
      {
        path: npm.localPrefix,
        args: [],
        scriptShell: undefined,
        stdio: 'inherit',
        stdioString: true,
        pkg: { name: 'x',
          version: '1.2.3',
          _id: 'x@1.2.3',
          scripts: {
            env: 'env',
          } },
        event: 'env',
      },
      { event: 'postenv' },
    ])
  })
  RUN_SCRIPTS.length = 0
})

t.test('skip pre/post hooks when using ignoreScripts', async t => {
  npm.flatOptions.ignoreScripts = true

  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      name: 'x',
      version: '1.2.3',
      scripts: {
        preenv: 'echo before the env',
        postenv: 'echo after the env',
      },
    }),
  })

  await runScript(['env'], er => {
    if (er)
      throw er

    t.deepEqual(RUN_SCRIPTS, [
      {
        path: npm.localPrefix,
        args: [],
        scriptShell: undefined,
        stdio: 'inherit',
        stdioString: true,
        pkg: { name: 'x',
          version: '1.2.3',
          _id: 'x@1.2.3',
          scripts: {
            preenv: 'echo before the env',
            postenv: 'echo after the env',
            env: 'env',
          } },
        banner: true,
        event: 'env',
      },
    ])

    delete npm.flatOptions.ignoreScripts
  })
  RUN_SCRIPTS.length = 0
})

t.test('run silent', async t => {
  npmlog.level = 'silent'
  t.teardown(() => {
    npmlog.level = 'warn'
  })

  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      name: 'x',
      version: '1.2.3',
      scripts: {
        preenv: 'echo before the env',
        postenv: 'echo after the env',
      },
    }),
  })

  await runScript(['env'], er => {
    if (er)
      throw er

    t.match(RUN_SCRIPTS, [
      {
        event: 'preenv',
        stdio: 'inherit',
      },
      {
        path: npm.localPrefix,
        args: [],
        scriptShell: undefined,
        stdio: 'inherit',
        stdioString: true,
        pkg: { name: 'x',
          version: '1.2.3',
          _id: 'x@1.2.3',
          scripts: {
            env: 'env',
          } },
        event: 'env',
        banner: false,
      },
      {
        event: 'postenv',
        stdio: 'inherit',
      },
    ])
  })
  RUN_SCRIPTS.length = 0
})

t.test('list scripts', async t => {
  const scripts = {
    test: 'exit 2',
    start: 'node server.js',
    stop: 'node kill-server.js',
    preenv: 'echo before the env',
    postenv: 'echo after the env',
  }
  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      name: 'x',
      version: '1.2.3',
      scripts,
    }),
  })

  await runScript([], er => {
    if (er)
      throw er
  })
  t.strictSame(output, [
    ['Lifecycle scripts included in x:'],
    ['  test\n    exit 2'],
    ['  start\n    node server.js'],
    ['  stop\n    node kill-server.js'],
    ['\navailable via `npm run-script`:'],
    ['  preenv\n    echo before the env'],
    ['  postenv\n    echo after the env'],
  ], 'basic report')
  output.length = 0

  npmlog.level = 'silent'
  await runScript([], er => {
    if (er)
      throw er
  })
  t.strictSame(output, [])
  npmlog.level = 'warn'

  npm.flatOptions.json = true
  await runScript([], er => {
    if (er)
      throw er
  })
  t.strictSame(output, [[JSON.stringify(scripts, 0, 2)]], 'json report')
  output.length = 0
  npm.flatOptions.json = false

  npm.flatOptions.parseable = true
  await runScript([], er => {
    if (er)
      throw er
  })
  t.strictSame(output, [
    ['test:exit 2'],
    ['start:node server.js'],
    ['stop:node kill-server.js'],
    ['preenv:echo before the env'],
    ['postenv:echo after the env'],
  ])
  output.length = 0
  npm.flatOptions.parseable = false
})

t.test('list scripts when no scripts', async t => {
  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      name: 'x',
      version: '1.2.3',
    }),
  })

  await runScript([], er => {
    if (er)
      throw er
  })
  t.strictSame(output, [], 'nothing to report')
  output.length = 0
})

t.test('list scripts, only commands', async t => {
  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      name: 'x',
      version: '1.2.3',
      scripts: { preversion: 'echo doing the version dance' },
    }),
  })

  await runScript([], er => {
    if (er)
      throw er
  })
  t.strictSame(output, [
    ['Lifecycle scripts included in x:'],
    ['  preversion\n    echo doing the version dance'],
  ])
  output.length = 0
})

t.test('list scripts, only non-commands', async t => {
  npm.localPrefix = t.testdir({
    'package.json': JSON.stringify({
      name: 'x',
      version: '1.2.3',
      scripts: { glorp: 'echo doing the glerp glop' },
    }),
  })

  await runScript([], er => {
    if (er)
      throw er
  })
  t.strictSame(output, [
    ['Scripts available in x via `npm run-script`:'],
    ['  glorp\n    echo doing the glerp glop'],
  ])
  output.length = 0
})
