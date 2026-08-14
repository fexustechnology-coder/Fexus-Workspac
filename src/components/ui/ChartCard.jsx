import { motion } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 shadow-card">
      <div className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="text-sm font-semibold text-ink">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </div>
      ))}
    </div>
  )
}

export default function ChartCard({ title, subtitle, type = 'area', data, dataKeys, height = 260, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-line bg-white p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-base">{title}</h3>
          {subtitle && <p className="text-xs text-ink/45 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {type === 'area' ? (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillFerozi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#14B8A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E6E8E8" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#0A0A0B99' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#0A0A0B99' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<CustomTooltip />} />
            {dataKeys.map((k) => (
              <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke="#14B8A6" strokeWidth={2.5} fill="url(#fillFerozi)" />
            ))}
          </AreaChart>
        ) : type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E6E8E8" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#0A0A0B99' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#0A0A0B99' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<CustomTooltip />} />
            {dataKeys.map((k, i) => (
              <Line key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={i === 0 ? '#14B8A6' : '#0A0A0B'} strokeWidth={2.5} dot={false} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E6E8E8" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#0A0A0B99' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#0A0A0B99' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<CustomTooltip />} />
            {dataKeys.map((k) => (
              <Bar key={k.key} dataKey={k.key} name={k.name} fill="#14B8A6" radius={[6, 6, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </motion.div>
  )
}
