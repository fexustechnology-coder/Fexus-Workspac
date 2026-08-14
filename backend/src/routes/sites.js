const { makeCrudRouter } = require('../lib/crudFactory')
module.exports = makeCrudRouter('site', ['name', 'domain', 'status'])
