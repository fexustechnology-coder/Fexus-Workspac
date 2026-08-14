const { makeCrudRouter } = require('../lib/crudFactory')
module.exports = makeCrudRouter('automation', ['name', 'trigger', 'runs', 'status'])
