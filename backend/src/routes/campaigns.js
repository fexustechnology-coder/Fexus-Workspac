const { makeCrudRouter } = require('../lib/crudFactory')
module.exports = makeCrudRouter('campaign', ['name', 'channel', 'status', 'reach'])
