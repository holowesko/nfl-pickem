import { isDatabaseConfigured } from '@/lib/db'
import { SetupChecklist } from '@/components/SetupChecklist'

export default function LeaderboardPage() {
  if (!isDatabaseConfigured) return <SetupChecklist />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
      <p className="text-muted">Standings appear once the first week is scored.</p>
    </div>
  )
}
