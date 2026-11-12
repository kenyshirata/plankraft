import type { LucideIcon } from 'lucide-react'

interface TabsProps<T extends string> {
  value: T
  onChange(value: T): void
  items: { value: T; label: string; icon?: LucideIcon }[]
}

export function Tabs<T extends string>({ value, onChange, items }: TabsProps<T>): React.JSX.Element {
  return (
    <div className="tabs" role="tablist">
      {items.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          className={`tabs__tab${v === value ? ' is-active' : ''}`}
          onClick={() => onChange(v)}
        >
          {Icon && <Icon size={14} strokeWidth={1.75} />}
          {label}
        </button>
      ))}
    </div>
  )
}
