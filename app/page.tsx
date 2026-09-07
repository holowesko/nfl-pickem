import { isDatabaseConfigured } from '@/lib/db'
import { currentPlayer, PLAYERS } from '@/lib/players'
import {
  getCurrentWeek,
  getWeekGames,
  getWeekPicks,
  getWeekBonuses,
  getAvatarVersions,
  type GameRow,
} from '@/lib/queries'
import { groupSlate, formatSpread, kickoffLabel, deadlineLabel } from '@/lib/slate'
import { arePicksClosed, isSpreadLocked } from '@/lib/time'
import { scoreWeek, underdogSide, POINTS_LOCK, POINTS_UPSET } from '@/lib/scoring'
import { buildSummaryRows } from '@/lib/summary'
import { SetupChecklist } from '@/components/SetupChecklist'
import { PlayerPicker } from '@/components/PlayerPicker'
import { AvatarUploader } from '@/components/AvatarUploader'
import { PickSummary } from '@/components/PickSummary'
import { GameCard, type OtherPick } from '@/components/GameCard'
import { BonusPicker, type BonusOption } from '@/components/BonusPicker'

/**
 * Every team still pickable this week, one entry per side.
 *
 * `onlyUnderdogs` is what makes the Upset list legal by construction rather
 * than by rejecting a choice after the fact.
 */
function bonusOptions(games: GameRow[], onlyUnderdogs: boolean): BonusOption[] {
  const options: BonusOption[] = []

  for (const game of games) {
    if (arePicksClosed(new Date(game.kickoff))) continue

    const dog = underdogSide(game.spreadHome)

    // The Upset needs a line to know who the underdog is. The Lock does not —
    // it is about winning outright — so a game without a posted line can still
    // be locked.
    if (onlyUnderdogs && dog === null) continue

    for (const side of ['away', 'home'] as const) {
      if (onlyUnderdogs && side !== dog) continue

      const isHome = side === 'home'
      const line = formatSpread(game.spreadHome, side)
      options.push({
        gameId: game.id,
        side,
        team: isHome ? game.homeTeam : game.awayTeam,
        name: isHome ? game.homeName : game.awayName,
        detail: `${isHome ? 'vs' : '@'} ${isHome ? game.awayTeam : game.homeTeam} · ${line}`,
      })
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name))
}

export default async function ThisWeekPage() {
  if (!isDatabaseConfigured) return <SetupChecklist />

  const player = await currentPlayer()
  const current = await getCurrentWeek()

  if (!current) {
    return (
      <Empty
        title="No week loaded yet"
        body="Nothing has pulled in the schedule yet."
        hint={
          process.env.NODE_ENV === 'production'
            ? 'Run the sync job once from the Actions tab.'
            : 'npm run seed'
        }
      />
    )
  }

  const [games, picks, bonuses, avatars] = await Promise.all([
    getWeekGames(current.season, current.week),
    getWeekPicks(current.season, current.week),
    getWeekBonuses(current.season, current.week),
    getAvatarVersions(),
  ])

  if (games.length === 0) {
    return <Empty title={`Week ${current.week}`} body="No games on the slate yet." />
  }

  const groups = groupSlate(games)
  const myPicks = new Map(
    picks.filter((p) => p.playerId === player?.id).map((p) => [p.gameId, p])
  )

  const scores = PLAYERS.map((p) => ({
    player: p,
    score: scoreWeek(
      p.id,
      current.week,
      games,
      picks.filter((pick) => pick.playerId === p.id),
      bonuses.filter((bonus) => bonus.playerId === p.id)
    ),
    made: picks.filter((pick) => pick.playerId === p.id).length,
    // At most two, since the table allows one Lock and one Upset per week.
    bonusesMade: bonuses.filter((bonus) => bonus.playerId === p.id).length,
  }))

  const summaryRows = buildSummaryRows(games, picks, bonuses, PLAYERS)

  const lockOptions = bonusOptions(games, false)
  const upsetOptions = bonusOptions(games, true)

  const mine = (kind: 'lock' | 'upset') =>
    bonuses.find((b) => b.playerId === player?.id && b.kind === kind) ?? null

  const asOption = (kind: 'lock' | 'upset'): BonusOption | null => {
    const bonus = mine(kind)
    if (!bonus) return null
    const list = kind === 'lock' ? lockOptions : upsetOptions
    const match = list.find((o) => o.gameId === bonus.gameId && o.side === bonus.side)
    if (match) return match

    // The chosen game has kicked off, so it is no longer in the option list.
    // Still show what was picked.
    const game = games.find((g) => g.id === bonus.gameId)
    if (!game) return null
    const isHome = bonus.side === 'home'
    return {
      gameId: bonus.gameId,
      side: bonus.side,
      team: isHome ? game.homeTeam : game.awayTeam,
      name: isHome ? game.homeName : game.awayName,
      detail: 'Locked in',
    }
  }

  return (
    <div className="space-y-6">
      <PlayerPicker players={PLAYERS} currentId={player?.id} />

      {player ? <AvatarUploader hasPhoto={avatars.has(player.id)} /> : null}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Week {current.week}</h1>
          <PickSummary week={current.week} players={PLAYERS} rows={summaryRows} />
        </div>
        <p className="text-sm text-muted">{games.length} games</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {scores.map(({ player: p, score, made, bonusesMade }) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface p-3 text-center">
            {/* Fixed height either way, so a tile with a photo and a tile
                without still line up. */}
            <div className="flex h-10 items-center justify-center">
              {avatars.has(p.id) ? (
                // The photo stands in for the name, so it carries the name as
                // its alt text. The version string busts the browser cache the
                // moment a new photo is saved.
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/avatar/${p.id}?v=${avatars.get(p.id)}`}
                  alt={p.name}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted">{p.name}</span>
              )}
            </div>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{score.points}</p>
            {/* A notch below text-xs so both counters hold one line on a
                320px phone, and so they read as secondary to the score. */}
            <p className="text-[0.7rem] tabular-nums text-muted">
              {made}/{games.length} games
            </p>
            <p className="text-[0.7rem] tabular-nums text-muted" title="Lock and Upset">
              {bonusesMade}/2 L+U
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BonusPicker
          kind="lock"
          label="Lock"
          points={`${POINTS_LOCK} pts`}
          hint="One a week. Wins outright, spread be damned."
          options={lockOptions}
          selected={asOption('lock')}
          season={current.season}
          week={current.week}
          canPick={Boolean(player)}
        />
        <BonusPicker
          kind="upset"
          label="Upset"
          points={`${POINTS_UPSET} pts`}
          hint="One a week. Underdogs only, must win outright."
          options={upsetOptions}
          selected={asOption('upset')}
          season={current.season}
          week={current.week}
          canPick={Boolean(player)}
        />
      </div>

      {groups.map((group) => {
        const spreadLocked = isSpreadLocked(new Date(group.games[0].kickoff))

        return (
          <section key={group.key} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {group.label}
              </h2>
              <p className="text-xs text-muted">
                {spreadLocked
                  ? 'Lines final'
                  : `Lines freeze ${deadlineLabel(group.lockAt)}`}
              </p>
            </div>

            <div className="grid gap-2">
              {group.games.map((game) => {
                const mySide = myPicks.get(game.id)?.side ?? null

                // Other players' picks stay hidden until this game kicks off.
                // The filtering happens here, on the server, so the hidden
                // picks are never serialised into the page at all — hiding
                // them in the component would still ship them to the browser
                // for anyone curious enough to read the source.
                const revealed = arePicksClosed(new Date(game.kickoff))
                const theirs = picks.filter(
                  (p) => p.gameId === game.id && p.playerId !== player?.id
                )
                const others: OtherPick[] = revealed
                  ? theirs.map((p) => ({
                      playerId: p.playerId,
                      playerName:
                        PLAYERS.find((x) => x.id === p.playerId)?.name ?? p.playerId,
                      side: p.side,
                      isLock: bonuses.some(
                        (b) =>
                          b.playerId === p.playerId &&
                          b.kind === 'lock' &&
                          b.gameId === game.id &&
                          b.side === p.side
                      ),
                      isUpset: bonuses.some(
                        (b) =>
                          b.playerId === p.playerId &&
                          b.kind === 'upset' &&
                          b.gameId === game.id &&
                          b.side === p.side
                      ),
                    }))
                  : []

                return (
                  <GameCard
                    key={game.id}
                    game={{
                      id: game.id,
                      homeTeam: game.homeTeam,
                      awayTeam: game.awayTeam,
                      homeName: game.homeName,
                      awayName: game.awayName,
                      kickoff: game.kickoff,
                      kickoffLabel: kickoffLabel(game.kickoff),
                      spreadHome: game.spreadHome,
                      lockedSpreadHome: game.lockedSpreadHome,
                      homeScore: game.homeScore,
                      awayScore: game.awayScore,
                      final: game.final,
                      locked: revealed,
                      spreadLocked: isSpreadLocked(new Date(game.kickoff)),
                    }}
                    mySide={mySide}
                    others={others}
                    othersIn={revealed ? 0 : theirs.length}
                    canPick={Boolean(player)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Empty({ title, body, hint }: { title: string; body: string; hint?: string }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted">{body}</p>
      {hint ? (
        <p className="rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
