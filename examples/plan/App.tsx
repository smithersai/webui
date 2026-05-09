import * as React from 'react'
import { Card, Button, Badge } from 'smithers-webui/ui'
import { signal } from 'smithers-webui/runtime'

type Mdx = React.ComponentType

export default function App({ mdx }: { mdx: Mdx[] }) {
  const Plan = mdx[0]
  return (
    <main className="mx-auto max-w-3xl py-12 px-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-500">Refactor plan</h2>
        <Badge variant="warn">awaiting approval</Badge>
      </div>
      <Card>
        <article className="prose prose-slate max-w-none">{Plan ? <Plan /> : null}</article>
      </Card>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={() => signal('reject', {})}>
          Reject
        </Button>
        <Button onClick={() => signal('approve', {})}>Approve</Button>
      </div>
    </main>
  )
}
