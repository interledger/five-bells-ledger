'use strict'

const _ = require('lodash')
const Config = require('five-bells-shared').Config
const envPrefix = 'ledger'
const log = require('../services/log').create('config')

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
    precision: parseInt(Config.getEnv(envPrefix, 'AMOUNT_PRECISION'), 10) || 19,
    scale: parseInt(Config.getEnv(envPrefix, 'AMOUNT_SCALE'), 10) || 9
  }
}

function parseCurrencyConfig () {
  return {
    code: Config.getEnv(envPrefix, 'CURRENCY_CODE') || null,
    symbol: Config.getEnv(envPrefix, 'CURRENCY_SYMBOL') || null
  }
}

function parseIlpConfig () {
  return {
    prefix: Config.getEnv(envPrefix, 'ILP_PREFIX') || null
  }
}

function parseAdminConfig () {
  const adminUser = Config.getEnv(envPrefix, 'ADMIN_USER') || 'admin'
  const adminPass = Config.getEnv(envPrefix, 'ADMIN_PASS')
  const adminFingerprint = Config.getEnv(envPrefix, 'ADMIN_TLS_FINGERPRINT')

  if (adminPass || adminFingerprint) {
    return _.omitBy({
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
      }
    }
  } else {
    return {}
  }
}

function parseRecommendedConnectors () {
  const connectorList = Config.getEnv(envPrefix, 'RECOMMENDED_CONNECTORS')
  if (!connectorList) return []
  if (connectorList === '*') {
    log.warn('DEPRECATED: Ledger no longer supports autodetecting recommended connectors')
    return []
  }
  return connectorList.split(',')
}

function getLogLevel () {
  if (useTestConfig()) {
    return 'debug'
  } else {
    // https://github.com/trentm/node-bunyan#levels
    return Config.getEnv(envPrefix, 'LOG_LEVEL') || 'info'
  }
}

function parseWebsocketConfig () {
  const intervalSeconds = parseInt(Config.getEnv(envPrefix, 'WEBSOCKET_PING_INTERVAL'), 10) || 20
  return {
    pingInterval: intervalSeconds * 1000
  }
}

function isEmpty (value) {
  return _.isEmpty(value) && typeof value !== 'number'
}

function loadConfig () {
  const localConfig = {}

  localConfig.maxHttpPayload = '64kb'
  localConfig.features = parseFeaturesConfig()
  localConfig.amount = parseAmountConfig()
  localConfig.default_admin = parseAdminConfig()
  localConfig.ilp = parseIlpConfig()
  localConfig.recommendedConnectors = parseRecommendedConnectors()
  localConfig.logLevel = getLogLevel()
  localConfig.authTokenSecret = Config.generateSecret(envPrefix, 'authToken')
  localConfig.authTokenMaxAge = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  localConfig.websocket = parseWebsocketConfig()

  // optional
  localConfig.currency = parseCurrencyConfig()
  localConfig.keys = parseKeysConfig()

  const config = Config.loadConfig(envPrefix, _.omitBy(localConfig, isEmpty))
  return config
}

module.exports = loadConfig
