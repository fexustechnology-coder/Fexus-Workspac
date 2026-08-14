const { makeCrudRouter } = require('../lib/crudFactory')
module.exports = makeCrudRouter('expense', ['label', 'amount'])
