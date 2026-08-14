import Reveal from './Reveal'

/**
 * columns: [{ key, label, render?(row) }]
 */
export default function DataTable({ columns, rows, keyField = 'id' }) {
  return (
    <Reveal>
      <div className="rounded-2xl border border-line bg-white shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-mist/60">
                {columns.map((c) => (
                  <th key={c.key} className="text-left font-mono text-[10px] tracking-wideish uppercase text-ink/45 px-5 py-3 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[keyField]} className="border-b border-line last:border-0 hover:bg-mist/40 transition-colors">
                  {columns.map((c) => (
                    <td key={c.key} className="px-5 py-4 text-ink/80 whitespace-nowrap">
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Reveal>
  )
}
