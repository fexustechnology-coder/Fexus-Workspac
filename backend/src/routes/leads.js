const { makeCrudRouter } = require('../lib/crudFactory')
// Extended in Phase 13 to expose the full CRM Lead structure.
module.exports = makeCrudRouter('lead', ['name', 'company', 'email', 'phone', 'website', 'industry', 'source', 'status', 'priority', 'notes'])
