const { makeCrudRouter } = require('../lib/crudFactory')
module.exports = makeCrudRouter('deal', ['name', 'stage', 'value', 'owner'])
