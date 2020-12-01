const t = require('tap')
const requireInject = require('require-inject')

const redactCwd = (path) => {
  const normalizePath = p => p
    .replace(/\\+/g, '/')
    .replace(/\r\n/g, '\n')
  const replaceCwd = p => p
    .replace(new RegExp(normalizePath(process.cwd()), 'g'), '{CWD}')
  const cleanupWinPaths = p => p
    .replace(normalizePath(process.execPath), '/path/to/node')
    .replace(normalizePath(process.env.HOME), '~/')

  return cleanupWinPaths(
    replaceCwd(
      normalizePath(path)
    )
  )
}

t.cleanSnapshot = (str) => redactCwd(str)

let result = ''
const types = {
  'init-author-name': String,
  'init-version': String,
  'init.author.name': String,
  'init.version': String,
}
const defaults = {
  'init-author-name': '',
  'init-version': '1.0.0',
  'init.author.name': '',
  'init.version': '1.0.0',
}

const flatOptions = {
  editor: 'vi',
  json: false,
  long: false,
  global: false,
}

const npm = {
  flatOptions,
  log: {
    info: () => null,
    enableProgress: () => null,
    disableProgress: () => null,
  },
  config: {
    data: new Map(Object.entries({
      default: { data: defaults, source: 'default values' },
      global: { data: {}, source: '/etc/npmrc' },
      cli: { data: flatOptions, source: 'command line options' },
    })),
    get (key) {
      return flatOptions[key]
    },
    validate () {
      return true
    },
  },
}

const usageUtil = () => 'usage instructions'

const mocks = {
  '../../lib/utils/config.js': { defaults, types },
  '../../lib/npm.js': npm,
  '../../lib/utils/output.js': msg => {
    result = msg
  },
  '../../lib/utils/usage.js': usageUtil,
}

const config = requireInject('../../lib/config.js', mocks)

t.test('config no args', t => {
  config([], (err) => {
    t.match(err, /usage instructions/, 'should not error out on empty locations')
    t.end()
  })
})

t.test('config list', t => {
  t.plan(2)

  npm.config.find = () => 'cli'
  result = ''
  t.teardown(() => {
    result = ''
    delete npm.config.find
  })

  config(['list'], (err) => {
    t.ifError(err, 'npm config list')
    t.matchSnapshot(result, 'should list configs')
  })
})

t.test('config list overrides', t => {
  t.plan(2)

  npm.config.data.set('user', {
    data: {
      'init.author.name': 'Foo',
      '//private-reg.npmjs.org/:_authThoken': 'f00ba1',
    },
    source: '~/.npmrc',
  })
  flatOptions['init.author.name'] = 'Bar'
  npm.config.find = () => 'cli'
  result = ''
  t.teardown(() => {
    result = ''
    npm.config.data.delete('user')
    delete flatOptions['init.author.name']
    delete npm.config.find
  })

  config(['list'], (err) => {
    t.ifError(err, 'npm config list')
    t.matchSnapshot(result, 'should list overriden configs')
  })
})

t.test('config list --long', t => {
  t.plan(2)

  npm.config.find = key => key in flatOptions ? 'cli' : 'default'
  flatOptions.long = true
  result = ''
  t.teardown(() => {
    delete npm.config.find
    flatOptions.long = false
    result = ''
  })

  config(['list'], (err) => {
    t.ifError(err, 'npm config list --long')
    t.matchSnapshot(result, 'should list all configs')
  })
})

t.test('config list --json', t => {
  t.plan(2)

  flatOptions.json = true
  result = ''
  npm.config.list = [{
    '//private-reg.npmjs.org/:_authThoken': 'f00ba1',
    ...npm.config.data.get('cli').data,
  }]
  const npmConfigGet = npm.config.get
  npm.config.get = key => npm.config.list[0][key]

  t.teardown(() => {
    delete npm.config.list
    flatOptions.json = false
    npm.config.get = npmConfigGet
    result = ''
  })

  config(['list'], (err) => {
    t.ifError(err, 'npm config list --json')
    t.deepEqual(
      JSON.parse(result),
      {
        editor: 'vi',
        json: true,
        long: false,
        global: false,
      },
      'should list configs usin json'
    )
  })
})

t.test('config delete no args', t => {
  config(['delete'], (err) => {
    t.equal(
      err.message,
      'usage instructions',
      'should throw usage error'
    )
    t.equal(err.code, 'EUSAGE', 'should throw expected error code')
    t.end()
  })
})

t.test('config delete key', t => {
  t.plan(4)

  npm.config.delete = (key, where) => {
    t.equal(key, 'foo', 'should delete expected keyword')
    t.equal(where, 'user', 'should delete key from user config by default')
  }

  npm.config.save = where => {
    t.equal(where, 'user', 'should save user config post-delete')
  }

  config(['delete', 'foo'], (err) => {
    t.ifError(err, 'npm config delete key')
  })

  t.teardown(() => {
    delete npm.config.delete
    delete npm.config.save
  })
})

t.test('config delete key --global', t => {
  t.plan(4)

  npm.config.delete = (key, where) => {
    t.equal(key, 'foo', 'should delete expected keyword from global configs')
    t.equal(where, 'global', 'should delete key from global config by default')
  }

  npm.config.save = where => {
    t.equal(where, 'global', 'should save global config post-delete')
  }

  flatOptions.global = true
  config(['delete', 'foo'], (err) => {
    t.ifError(err, 'npm config delete key --global')
  })

  t.teardown(() => {
    flatOptions.global = false
    delete npm.config.delete
    delete npm.config.save
  })
})

t.test('config set no args', t => {
  config(['set'], (err) => {
    t.equal(
      err.message,
      'usage instructions',
      'should throw usage error'
    )
    t.end()
  })
})

t.test('config set key', t => {
  t.plan(5)

  npm.config.set = (key, val, where) => {
    t.equal(key, 'foo', 'should set expected key to user config')
    t.equal(val, 'bar', 'should set expected value to user config')
    t.equal(where, 'user', 'should set key/val in user config by default')
  }

  npm.config.save = where => {
    t.equal(where, 'user', 'should save user config')
  }

  config(['set', 'foo', 'bar'], (err) => {
    t.ifError(err, 'npm config set key')
  })

  t.teardown(() => {
    delete npm.config.set
    delete npm.config.save
  })
})

t.test('config set key=val', t => {
  t.plan(5)

  npm.config.set = (key, val, where) => {
    t.equal(key, 'foo', 'should set expected key to user config')
    t.equal(val, 'bar', 'should set expected value to user config')
    t.equal(where, 'user', 'should set key/val in user config by default')
  }

  npm.config.save = where => {
    t.equal(where, 'user', 'should save user config')
  }

  config(['set', 'foo=bar'], (err) => {
    t.ifError(err, 'npm config set key')
  })

  t.teardown(() => {
    delete npm.config.set
    delete npm.config.save
  })
})

t.test('config set key to empty value', t => {
  t.plan(5)

  npm.config.set = (key, val, where) => {
    t.equal(key, 'foo', 'should set expected key to user config')
    t.equal(val, '', 'should set empty value to user config')
    t.equal(where, 'user', 'should set key/val in user config by default')
  }

  npm.config.save = where => {
    t.equal(where, 'user', 'should save user config')
  }

  config(['set', 'foo'], (err) => {
    t.ifError(err, 'npm config set key to empty value')
  })

  t.teardown(() => {
    delete npm.config.set
    delete npm.config.save
  })
})

t.test('config set invalid key', t => {
  t.plan(3)

  const npmConfigValidate = npm.config.validate
  npm.config.save = () => null
  npm.config.set = () => null
  npm.config.validate = () => false
  npm.log.warn = (title, msg) => {
    t.equal(title, 'config', 'should warn with expected title')
    t.equal(msg, 'omitting invalid config values', 'should use expected msg')
  }
  t.teardown(() => {
    npm.config.validate = npmConfigValidate
    delete npm.config.save
    delete npm.config.set
    delete npm.log.warn
  })

  config(['set', 'foo', 'bar'], (err) => {
    t.ifError(err, 'npm config set invalid key')
  })
})

t.test('config set key --global', t => {
  t.plan(5)

  npm.config.set = (key, val, where) => {
    t.equal(key, 'foo', 'should set expected key to global config')
    t.equal(val, 'bar', 'should set expected value to global config')
    t.equal(where, 'global', 'should set key/val in global config')
  }

  npm.config.save = where => {
    t.equal(where, 'global', 'should save global config')
  }

  flatOptions.global = true
  config(['set', 'foo', 'bar'], (err) => {
    t.ifError(err, 'npm config set key --global')
  })

  t.teardown(() => {
    flatOptions.global = false
    delete npm.config.set
    delete npm.config.save
  })
})

t.test('config get no args', t => {
  t.plan(2)

  npm.config.find = () => 'cli'
  result = ''
  t.teardown(() => {
    result = ''
    delete npm.config.find
  })

  config(['get'], (err) => {
    t.ifError(err, 'npm config get no args')
    t.matchSnapshot(result, 'should list configs on config get no args')
  })
})

t.test('config get key', t => {
  t.plan(2)

  const npmConfigGet = npm.config.get
  npm.config.get = (key) => {
    t.equal(key, 'foo', 'should use expected key')
    return 'bar'
  }

  npm.config.save = where => {
    throw new Error('should not save')
  }

  config(['get', 'foo'], (err) => {
    t.ifError(err, 'npm config get key')
  })

  t.teardown(() => {
    npm.config.get = npmConfigGet
    delete npm.config.save
  })
})

t.test('config get private key', t => {
  config(['get', '//private-reg.npmjs.org/:_authThoken'], (err) => {
    t.match(
      err,
      /The \/\/private-reg.npmjs.org\/:_authThoken option is protected, and cannot be retrieved in this way/,
      'should throw unable to retrieve error'
    )
    t.end()
  })
})

t.test('config edit', t => {
  t.plan(12)
  const npmrc = `//registry.npmjs.org/:_authToken=0000000
init.author.name=Foo
sign-git-commit=true`
  npm.config.data.set('user', {
    source: '~/.npmrc',
  })
  npm.config.save = async where => {
    t.equal(where, 'user', 'should save to user config by default')
  }
  const editMocks = {
    ...mocks,
    'mkdirp-infer-owner': async () => null,
    fs: {
      readFile (path, encoding, cb) {
        cb(null, npmrc)
      },
      writeFile (file, data, encoding, cb) {
        t.equal(file, '~/.npmrc', 'should save to expected file location')
        t.matchSnapshot(data, 'should write config file')
        cb()
      },
    },
    editor: (file, { editor }, cb) => {
      t.equal(file, '~/.npmrc', 'should match user source data')
      t.equal(editor, 'vi', 'should use default editor')
      cb()
    },
  }
  const config = requireInject('../../lib/config.js', editMocks)
  config(['edit'], (err) => {
    t.ifError(err, 'npm config edit')

    // test no config file result
    editMocks.fs.readFile = (p, e, cb) => {
      cb(new Error('ERR'))
    }
    const config = requireInject('../../lib/config.js', editMocks)
    config(['edit'], (err) => {
      t.ifError(err, 'npm config edit')
    })
  })

  t.teardown(() => {
    npm.config.data.delete('user')
    delete npm.config.save
  })
})

t.test('config edit --global', t => {
  t.plan(6)

  flatOptions.global = true
  const npmrc = 'init.author.name=Foo'
  npm.config.data.set('global', {
    source: '/etc/npmrc',
  })
  npm.config.save = async where => {
    t.equal(where, 'global', 'should save to global config')
  }
  const editMocks = {
    ...mocks,
    'mkdirp-infer-owner': async () => null,
    fs: {
      readFile (path, encoding, cb) {
        cb(null, npmrc)
      },
      writeFile (file, data, encoding, cb) {
        t.equal(file, '/etc/npmrc', 'should save to global file location')
        t.matchSnapshot(data, 'should write global config file')
        cb()
      },
    },
    editor: (file, { editor }, cb) => {
      t.equal(file, '/etc/npmrc', 'should match global source data')
      t.equal(editor, 'vi', 'should use default editor')
      cb()
    },
  }
  const config = requireInject('../../lib/config.js', editMocks)
  config(['edit'], (err) => {
    t.ifError(err, 'npm config edit --global')
  })

  t.teardown(() => {
    flatOptions.global = false
    npm.config.data.delete('user')
    delete npm.config.save
  })
})

t.test('config edit no editor set', t => {
  flatOptions.editor = undefined
  config(['edit'], (err) => {
    t.match(
      err,
      /No `editor` config or EDITOR environment variable set/,
      'should throw no available editor error'
    )
    flatOptions.editor = 'vi'
    t.end()
  })
})

t.test('completion', t => {
  const { completion } = config

  const testComp = (argv, expect) => {
    completion({ conf: { argv: { remain: argv } } }, (er, res) => {
      t.ifError(er)
      t.strictSame(res, expect, argv.join(' '))
    })
  }

  testComp(['npm', 'foo'], [])
  testComp(['npm', 'config'], [
    'get',
    'set',
    'delete',
    'ls',
    'rm',
    'edit',
    'list',
  ])
  testComp(['npm', 'config', 'set', 'foo'], [])
  const possibleConfigKeys = [...Object.keys(types)]
  testComp(['npm', 'config', 'get'], possibleConfigKeys)
  testComp(['npm', 'config', 'set'], possibleConfigKeys)
  testComp(['npm', 'config', 'delete'], possibleConfigKeys)
  testComp(['npm', 'config', 'rm'], possibleConfigKeys)
  testComp(['npm', 'config', 'edit'], [])
  testComp(['npm', 'config', 'list'], [])
  testComp(['npm', 'config', 'ls'], [])

  completion({
    conf: {
      argv: {
        remain: ['npm', 'config'],
      },
    },
    partialWord: 'l',
  }, (er, res) => {
    t.ifError(er)
    t.strictSame(res, [
      'get',
      'set',
      'delete',
      'ls',
      'rm',
      'edit',
    ], 'npm config')
  })

  t.end()
})
