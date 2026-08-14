const { makeCrudRouter } = require('../lib/crudFactory')
module.exports = makeCrudRouter('seoAudit', ['page', 'score', 'issues'])
