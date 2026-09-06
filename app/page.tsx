import { isDatabaseConfigured } from '@/lib/db'
import { currentPlayer } from '@/lib/players'
import { SetupChecklist } from '@/components/SetupChecklist'

export default async function ThisWeekPage() {
  const player = await currentPlayer()

  if (!isDatabaseConfigured) {
    return <SetupChecklist />
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">This Week</h1>
      {!player && (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          Tap your name above to start picking.
        </p>
      )}
      <p className="text-muted">
        The slate will appear here once the schedule importer runs.
      </p>
    </div>
  )
}
