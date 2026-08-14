import { useState } from 'react'

/**
 * fields: [{ key, label, type: 'text' | 'number' | 'select', options? }]
 * options may be plain strings (value === label, the original behavior) or
 * { value, label } objects when the value isn't human-readable on its own
 * (e.g. a database id) — both are supported so existing callers keep working.
 * onSubmit(values) — called with the filled form; caller decides how to
 * merge it into their list.
 */
function optionValue(o) { return typeof o === 'object' ? o.value : o }
function optionLabel(o) { return typeof o === 'object' ? o.label : o }

export default function QuickAddForm({ fields, onSubmit, submitLabel = 'Add', note }) {
  const initial = fields.reduce((acc, f) => ({ ...acc, [f.key]: f.options ? optionValue(f.options[0]) : '' }), {})
  const [values, setValues] = useState(initial)

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">{f.label}</label>
          {f.type === 'select' ? (
            <select
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all bg-white"
            >
              {f.options.map((o) => <option key={optionValue(o)} value={optionValue(o)}>{optionLabel(o)}</option>)}
            </select>
          ) : (
            <input
              type={f.type || 'text'}
              required={f.required !== false}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
      >
        {submitLabel}
      </button>
      {note && <p className="text-xs text-ink/35 text-center">{note}</p>}
    </form>
  )
}

