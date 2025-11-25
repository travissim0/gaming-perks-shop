'use client';

export interface StatCardData {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: string;
}

export function StatCard({ title, value, subtitle, icon, color }: StatCardData) {
  return (
    <div className={`bg-gradient-to-br ${color} backdrop-blur-sm border border-white/10 rounded-lg p-6`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-200 text-sm font-medium">{title}</h3>
        <div className="text-2xl">{icon}</div>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      {subtitle && <p className="text-gray-300 text-sm">{subtitle}</p>}
    </div>
  );
}

interface StatCardsGridProps {
  totalGames: number;
  totalPlayers: number;
  totalSeries: number;
  avgKdRatio: number;
}

export function StatCardsGrid({ totalGames, totalPlayers, totalSeries, avgKdRatio }: StatCardsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
      <StatCard
        title="Total Games Played"
        value={totalGames}
        subtitle="Across all players"
        icon="🎮"
        color="from-blue-600/20 to-blue-800/30"
      />
      <StatCard
        title="Active Players"
        value={totalPlayers}
        subtitle="With recorded stats"
        icon="👥"
        color="from-purple-600/20 to-purple-800/30"
      />
      <StatCard
        title="Series Completed"
        value={totalSeries}
        subtitle="Best-of matches"
        icon="🏆"
        color="from-cyan-600/20 to-cyan-800/30"
      />
      <StatCard
        title="Average K/D Ratio"
        value={avgKdRatio.toFixed(2)}
        subtitle="Community average"
        icon="⚔️"
        color="from-pink-600/20 to-pink-800/30"
      />
    </div>
  );
}

