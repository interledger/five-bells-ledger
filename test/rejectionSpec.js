'use strict'

const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost', '127.0.0.1'])
const expect = require('chai').expect
const app = require('../src/services/app')
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('./helpers/log')
const sinon = require('sinon')
const accounts = require('./data/accounts')
const validator = require('./helpers/validator')
const getAccount = require('../src/models/db/accounts').getAccount

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('PUT /rejection', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()
    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    this.proposedTransfer = _.cloneDeep(require('./data/transfers/proposed'))
    this.preparedTransfer = _.cloneDeep(require('./data/transfers/prepared'))
    this.executedTransfer = _.cloneDeep(require('./data/transfers/executed'))
    this.multiCreditTransfer = _.cloneDeep(require('./data/transfers/multiCredit'))

    this.rejectionMessage1 = {
      code: '123',
      name: 'Error 1',
      message: 'error 1',
      triggered_by: 'example.red.bob',
      additional_info: {}
    }
    this.rejectionMessage2 = {
      code: '123',
      name: 'Error 2',
      message: 'error 2',
      triggered_by: 'example.red.bob',
      additional_info: {}
    }

    yield dbHelper.addAccounts(_.values(accounts))
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
  })

  it('should return 401 if the request is not authenticated', function * () {
    yield this.request()
      .put(this.preparedTransfer.id + '/rejection')
      .expect(401)
      .end()
  })

  it('should return 404 when rejecting a non-existent transfer', function * () {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send(this.rejectionMessage1)
      .expect(404)
      .end()
  })

  it('should return 403 when rejecting a transfer as the wrong user', function * () {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('alice', 'alice')
      .send(this.rejectionMessage1)
      .expect(403)
      .expect({
        id: 'UnauthorizedError',
        message: 'Invalid attempt to reject credit'
      })
      .end()
  })

  it('should reject a prepared transfer', function * () {
    const transfer = this.preparedTransfer
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(90)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send(this.rejectionMessage1)
      .expect(201)
      .expect(this.rejectionMessage1)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(100)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send(this.rejectionMessage2)
      .expect(400)
      .expect(function (res) {
        expect(res.body.id).to.equal('InvalidModificationError')
        expect(res.body.message).to.equal('Transfer may not be modified in this way')
      })
      .end()

    yield this.request()
      .get(transfer.id)
      .auth('alice', 'alice')
      .expect(200)
      .expect(Object.assign(transfer, {
        state: 'rejected',
        rejection_reason: 'cancelled',
        credits: [
          Object.assign(transfer.credits[0], {
            rejected: true,
            rejection_message: this.rejectionMessage1
          })
        ],
        timeline: {
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z',
          rejected_at: '2015-06-16T00:00:00.000Z'
        }
      }))
  })

  it('rejects the transfer when a credit is rejected', function * () {
    const transfer = Object.assign(this.multiCreditTransfer,
      {execution_condition: 'ni:///sha-256;vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI?fpt=preimage-sha-256&cost=7'})
    yield this.request()
      .put(transfer.id)
      .auth('alice', 'alice')
      .send(transfer)
      .expect(201)
      .expect(validator.validateTransfer)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(80)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('dave', 'dave')
      .send(this.rejectionMessage1)
      .expect(201)
      .expect(this.rejectionMessage1)
      .end()

    // Check balances
    expect((yield getAccount('alice')).balance).to.equal(100)
    expect((yield getAccount('bob')).balance).to.equal(0)

    yield this.request()
      .put(transfer.id + '/rejection')
      .auth('bob', 'bob')
      .send(this.rejectionMessage2)
      .expect(201)
      .expect(this.rejectionMessage2)
      .end()

    yield this.request()
      .get(transfer.id)
      .auth('alice', 'alice')
      .expect(200)
      .expect(Object.assign(transfer, {
        state: 'rejected',
        rejection_reason: 'cancelled',
        credits: [
          Object.assign(transfer.credits[0], { // bob
            rejected: true,
            rejection_message: this.rejectionMessage2
          }),
          Object.assign(transfer.credits[1], { // dave
            rejected: true,
            rejection_message: this.rejectionMessage1
          })
        ],
        timeline: {
          prepared_at: '2015-06-16T00:00:00.000Z',
          proposed_at: '2015-06-16T00:00:00.000Z',
          rejected_at: '2015-06-16T00:00:00.000Z'
        }
      }))
  })
})
