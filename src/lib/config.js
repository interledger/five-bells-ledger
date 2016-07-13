'use strict'

const _ = require('lodash')
const Config = require('five-bells-shared').Config
const envPrefix = 'ledger'
const fs = require('fs')
const path = require('path')
const keypair = require('keypair')
const log = require('../services/log')('config')

function isRunningTests () {
  return process.argv[0].endsWith('mocha') ||
    (process.argv.length > 1 && process.argv[0].endsWith('node') &&
     process.argv[1].endsWith('mocha'))
}

function useTestConfig () {
  return !Config.castBool(process.env.UNIT_TEST_OVERRIDE) && isRunningTests()
}

function parseAmountConfig () {
  return {
    precision: parseInt(Config.getEnv(envPrefix, 'AMOUNT_PRECISION'), 10) || 10,
    scale: parseInt(Config.getEnv(envPrefix, 'AMOUNT_SCALE'), 10) || 2
  }
}

function parseCurrencyConfig () {
  return {
    code: Config.getEnv(envPrefix, 'CURRENCY_CODE') || null,
    symbol: Config.getEnv(envPrefix, 'CURRENCY_SYMBOL') || null
  }
}

function parseAdminConfig () {
  const adminUser = Config.getEnv(envPrefix, 'ADMIN_USER') || 'admin'
  const adminPass = Config.getEnv(envPrefix, 'ADMIN_PASS')
  const adminFingerprint = Config.getEnv(envPrefix, 'ADMIN_TLS_FINGERPRINT')

  if (adminPass || adminFingerprint) {
    return _.omit({
      user: adminUser,
      pass: adminPass,
      fingerprint: adminFingerprint
    }, _.isUndefined)
  }
}

function parseFeaturesConfig () {
  return {
    hasCreditAuth: Config.castBool(Config.getEnv(envPrefix, 'FEATURE_CREDIT_AUTH'))
  }
}

function parseKeysConfig () {
  if (useTestConfig()) {
    return {
      ed25519: {
        secret: 'lu+43o/0NUeF5iJTHXQQY6eqMaY06Xx6G1ABc6q1UQk=',
        public: 'YXg177AOkDlGGrBaoSET+UrMscbHGwFXHqfUMBZTtCY='
      },
      notification_sign: {
        secret: fs.readFileSync(path.join(__dirname, '../../test/data/signKeyRSAPrv.pem'), 'utf8'),
        public: fs.readFileSync(path.join(__dirname, '../../test/data/signKeyRSAPub.pem'), 'utf8')
      }
    }
  } else {
    const privateKeyPath = Config.getEnv(envPrefix, 'SIGNING_PRIVATE_KEY')
    const publicKeyPath = Config.getEnv(envPrefix, 'SIGNING_PUBLIC_KEY')
    if (!privateKeyPath || !publicKeyPath) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(envPrefix.toUpperCase() + '_SIGNING_PRIVATE_KEY and ' +
          envPrefix.toUpperCase() + '_SIGNING_PUBLIC_KEY must be provided')
      }
      log.warn('Using autogenerated keys for notification signing.')
      const keys = keypair()
      return {
        notification_sign: {
          secret: keys.private,
          public: keys.public
        }
      }
    }
    return {
      notification_sign: {
        secret: fs.readFileSync(privateKeyPath, 'utf8'),
        public: fs.readFileSync(publicKeyPath, 'utf8')
      }
    }
  }
}

function parseLogLevel () {
  if (useTestConfig()) {
    return 'debug'
  } else {
    // https://github.com/trentm/node-bunyan#levels
    return Config.getEnv(envPrefix, 'LOG_LEVEL') || 'info'
  }
}

function validateConfig (config) {
  // Validate precision
  const isOracle = config.getIn(['db', 'uri'], '').startsWith('oracle://') !== null
  const tlsKey = config.getIn(['tls', 'key'])
  const notificationSigningKey = config.getIn(['keys', 'notification_sign', 'secret'])

  // strong-oracle return native JS Numbers from Number type columns
  // Cannot support precision greater than 15
  if (!useTestConfig() && isOracle && config.getIn(['amount', 'precision']) > 15) {
    throw new Error('Cannot support precision > 15 with OracleDB')
  }

  // Disallow the use of the same keys for TLS auth and notification signing
  if (tlsKey && notificationSigningKey && tlsKey.toString() === notificationSigningKey) {
    throw new Error('LEDGER_SIGNING_PRIVATE_KEY must differ from LEDGER_TLS_KEY')
  }
}

function loadConfig () {
  const localConfig = {}

  localConfig.features = parseFeaturesConfig()
  localConfig.amount = parseAmountConfig()
  localConfig.default_admin = parseAdminConfig()
  localConfig.logLevel = parseLogLevel()

  // optional
  localConfig.currency = parseCurrencyConfig()
  localConfig.keys = parseKeysConfig()

  const config = Config.loadConfig(envPrefix, _.omit(localConfig, _.isEmpty))
  validateConfig(config)
  return config
}

module.exports = loadConfig
