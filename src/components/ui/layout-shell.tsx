import type { ElementType, ReactNode } from 'react'

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type PageShellProps = {
  as?: ElementType
  centered?: boolean
  className?: string
  children: ReactNode
}

export function PageShell({
  as: Component = 'main',
  centered = false,
  className,
  children,
}: PageShellProps) {
  return (
    <Component
      className={joinClasses(
        'min-h-screen bg-cream px-6 py-10',
        centered && 'flex items-center justify-center',
        className
      )}
    >
      {children}
    </Component>
  )
}

type SurfaceCardProps = {
  as?: ElementType
  className?: string
  children: ReactNode
}

export function SurfaceCard({
  as: Component = 'div',
  className,
  children,
}: SurfaceCardProps) {
  return (
    <Component className={joinClasses('surface-panel rounded-card', className)}>
      {children}
    </Component>
  )
}
