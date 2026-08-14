const { PrismaClient } = require('@prisma/client')

let prisma
if (!global.__fexusPrisma) {
  global.__fexusPrisma = new PrismaClient()
}
prisma = global.__fexusPrisma

module.exports = prisma
