const { PrismaClient } = require('@prisma/client')
const { DEPARTMENTS } = require('../src/constants')
const { EMPLOYEE_ROSTER } = require('../src/employeeRoster')

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding FEXUS Workspace Robot Office...')

  // CEO — no department, top of the org. Phase 24 (Voice Agent) — renamed
  // to Amina, the same real employee row, not a new/duplicate one. The
  // `update` clause now actually applies the name on a re-seed of an
  // existing install, not just fresh ones.
  await prisma.employee.upsert({
    where: { id: 'ceo-seed' },
    update: { name: 'Amina' },
    create: {
      id: 'ceo-seed',
      name: 'Amina',
      title: 'CEO',
      level: 'ceo',
      status: 'idle'
    }
  })

  for (const dept of DEPARTMENTS) {
    const department = await prisma.department.upsert({
      where: { key: dept.key },
      update: { name: dept.name },
      create: { key: dept.key, name: dept.name }
    })

    await prisma.employee.upsert({
      where: { id: `director-${dept.key}` },
      update: {},
      create: {
        id: `director-${dept.key}`,
        name: dept.name,
        title: dept.name,
        level: 'director',
        departmentId: department.id,
        status: 'idle'
      }
    })

    await prisma.employee.upsert({
      where: { id: `employee-${dept.key}` },
      update: {},
      create: {
        id: `employee-${dept.key}`,
        name: `${dept.name.replace(' Director', '')} Employee`,
        title: `${dept.key} employee`,
        level: 'employee',
        departmentId: department.id,
        status: 'idle'
      }
    })
  }

  console.log('Seed complete: 1 CEO, 9 Directors, 9 Employees, 9 Departments.')

  // Phase 6 — the 56 named AI Employees, each with one fixed responsibility.
  // Additive only: the generic "{Department} Employee" seeded above per
  // department (Phase 2) is untouched and keeps serving the existing
  // CEO → Director → Employee escalation workflow in Company Office;
  // these are new rows for the new Employee Office / task queue framework.
  let seededCount = 0
  for (const emp of EMPLOYEE_ROSTER) {
    const department = await prisma.department.findUnique({ where: { key: emp.departmentKey } })
    if (!department) continue

    // Phase 24 (Voice Agent) — prefer a real, stable, explicit id when the
    // roster entry provides one (used for Amina/Hira/Shanza so a rename
    // updates the SAME existing row instead of forking a duplicate on
    // re-seed). Falls back to the original name-derived id for every
    // other roster entry, unchanged.
    const id = emp.id || `emp-${emp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    await prisma.employee.upsert({
      where: { id },
      update: { name: emp.name, title: emp.name, responsibility: emp.responsibility },
      create: {
        id,
        name: emp.name,
        title: emp.name,
        level: 'employee',
        departmentId: department.id,
        status: 'idle',
        responsibility: emp.responsibility
      }
    })
    seededCount++
  }

  console.log(`Seed complete: ${seededCount} named AI Employees across 9 departments (Phase 6).`)

  // Phase 9 — Integration Layer connector catalog. All start Disconnected /
  // Unknown health — nothing here is a real connection, just a registry entry.
  const { CONNECTORS } = require('../src/integrationConnectors')
  let connectorCount = 0
  for (const c of CONNECTORS) {
    await prisma.connector.upsert({
      where: { key: c.key },
      update: { name: c.name, category: c.category, authKind: c.authKind },
      create: { key: c.key, name: c.name, category: c.category, authKind: c.authKind }
    })
    connectorCount++
  }
  console.log(`Seed complete: ${connectorCount} connector registry entries across 7 categories (Phase 9).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
