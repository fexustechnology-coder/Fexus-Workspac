const { makeCrudRouter } = require('../lib/crudFactory')
module.exports = makeCrudRouter('supportTicket', ['subject', 'clientId', 'status', 'priority'])
