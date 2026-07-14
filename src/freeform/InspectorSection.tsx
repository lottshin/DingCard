import type { ReactNode } from 'react'

type InspectorSectionProps = {
  title: string
  testId: string
  tone?: 'default' | 'danger'
  children: ReactNode
}

export function InspectorSection({
  title,
  testId,
  tone = 'default',
  children,
}: InspectorSectionProps) {
  return (
    <section
      className={`inspector-section inspector-section-${tone}`}
      data-testid={testId}
    >
      <h2 className="inspector-section-title">{title}</h2>
      <div className="inspector-section-body">{children}</div>
    </section>
  )
}
