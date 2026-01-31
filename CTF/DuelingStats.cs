using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;

using InfServer.Game;
using InfServer.Logic;
using InfServer.Scripting;
using InfServer.Protocol;
using InfServer.Bots;

using Assets;

namespace InfServer.Script.GameType_USL
{
    /// <summary>
    /// Result data for a single round within a BO9 series
    /// </summary>
    public class DuelingRoundResult
    {
        public int RoundNumber { get; set; }
        public string WinnerAlias { get; set; }
        public string LoserAlias { get; set; }
        public int WinnerHpRemaining { get; set; }
        public int DurationSeconds { get; set; }
        public int WinnerShotsFired { get; set; }
        public int WinnerShotsHit { get; set; }
        public int LoserShotsFired { get; set; }
        public int LoserShotsHit { get; set; }
        public int WinnerKills { get; set; }
        public int LoserKills { get; set; }
    }

    /// <summary>
    /// Tracks the state of an active BO9 dueling series
    /// </summary>
    public class DuelingSeriesState
    {
        public string SeriesId { get; set; }
        public string Player1Alias { get; set; }
        public string Player2Alias { get; set; }
        public string ArenaName { get; set; }
        public List<DuelingRoundResult> Rounds { get; set; }
        public int Player1Score { get; set; }
        public int Player2Score { get; set; }
        public DateTime SeriesStartTime { get; set; }
        public bool IsComplete { get; set; }

        public DuelingSeriesState()
        {
            Rounds = new List<DuelingRoundResult>();
            SeriesId = Guid.NewGuid().ToString();
            SeriesStartTime = DateTime.UtcNow;
            IsComplete = false;
        }

        /// <summary>
        /// Total elapsed duration across all completed rounds
        /// </summary>
        public int TotalDurationSeconds
        {
            get { return Rounds.Sum(r => r.DurationSeconds); }
        }
    }

    /// <summary>
    /// Dueling stats tracker for Best-of-9 series.
    /// Uses DuelingSiteConnector to push stats to multiple websites.
    /// First player to win 5 rounds wins the series.
    /// </summary>
    public class DuelingStats
    {
        private static DuelingSiteConnector _connector;
        private static Dictionary<string, DuelingSeriesState> _activeSeries;
        private static readonly object _initLock = new object();
        private static bool _initialized = false;

        private const int ROUNDS_TO_WIN = 5;
        private const int MAX_ROUNDS = 9;

        /// <summary>
        /// Ensure the connector and state tracking are initialized
        /// </summary>
        private static void EnsureInitialized()
        {
            if (_initialized) return;

            lock (_initLock)
            {
                if (_initialized) return;

                _connector = new DuelingSiteConnector();
                _activeSeries = new Dictionary<string, DuelingSeriesState>(StringComparer.OrdinalIgnoreCase);
                _initialized = true;

                Console.WriteLine("DuelingStats: Initialized");
            }
        }

        /// <summary>
        /// Start a new BO9 dueling series between two players
        /// </summary>
        /// <param name="player1Alias">First player's alias</param>
        /// <param name="player2Alias">Second player's alias</param>
        /// <param name="arenaName">Arena where the duel is happening</param>
        /// <returns>The series ID for tracking</returns>
        public static string StartSeries(string player1Alias, string player2Alias, string arenaName)
        {
            EnsureInitialized();

            // If there's already an active series in this arena, clear it
            if (_activeSeries.ContainsKey(arenaName))
            {
                Console.WriteLine(String.Format("DuelingStats: Clearing previous series in arena {0}", arenaName));
                _activeSeries.Remove(arenaName);
            }

            var series = new DuelingSeriesState
            {
                Player1Alias = player1Alias,
                Player2Alias = player2Alias,
                ArenaName = arenaName
            };

            _activeSeries[arenaName] = series;

            Console.WriteLine(String.Format("DuelingStats: BO9 series started - {0} vs {1} in {2} (ID: {3})",
                player1Alias, player2Alias, arenaName, series.SeriesId));

            return series.SeriesId;
        }

        /// <summary>
        /// Record the result of a single round in an active BO9 series.
        /// Automatically detects series completion (first to 5 wins).
        /// </summary>
        public static async Task RecordRound(
            string arenaName,
            string winnerAlias,
            string loserAlias,
            int winnerHpRemaining,
            int durationSeconds,
            int winnerShotsFired,
            int winnerShotsHit,
            int loserShotsFired,
            int loserShotsHit,
            int winnerKills,
            int loserKills)
        {
            EnsureInitialized();

            if (!_activeSeries.ContainsKey(arenaName))
            {
                Console.WriteLine(String.Format("DuelingStats: No active series in arena {0}", arenaName));
                return;
            }

            var series = _activeSeries[arenaName];

            if (series.IsComplete)
            {
                Console.WriteLine(String.Format("DuelingStats: Series already complete in arena {0}", arenaName));
                return;
            }

            // Create round result
            int roundNumber = series.Rounds.Count + 1;
            var round = new DuelingRoundResult
            {
                RoundNumber = roundNumber,
                WinnerAlias = winnerAlias,
                LoserAlias = loserAlias,
                WinnerHpRemaining = winnerHpRemaining,
                DurationSeconds = durationSeconds,
                WinnerShotsFired = winnerShotsFired,
                WinnerShotsHit = winnerShotsHit,
                LoserShotsFired = loserShotsFired,
                LoserShotsHit = loserShotsHit,
                WinnerKills = winnerKills,
                LoserKills = loserKills
            };

            series.Rounds.Add(round);

            // Update series score
            if (winnerAlias.Equals(series.Player1Alias, StringComparison.OrdinalIgnoreCase))
                series.Player1Score++;
            else
                series.Player2Score++;

            Console.WriteLine(String.Format("DuelingStats: Round {0} - {1} wins ({2}-{3})",
                roundNumber, winnerAlias, series.Player1Score, series.Player2Score));

            // Send round result to all sites
            var roundPayload = DuelingSiteConnector.BuildJsonString(new
            {
                action = "round_result",
                series_id = series.SeriesId,
                round_number = roundNumber,
                player1_alias = series.Player1Alias,
                player2_alias = series.Player2Alias,
                winner_alias = winnerAlias,
                loser_alias = loserAlias,
                winner_hp_remaining = winnerHpRemaining,
                duration_seconds = durationSeconds,
                winner_shots_fired = winnerShotsFired,
                winner_shots_hit = winnerShotsHit,
                loser_shots_fired = loserShotsFired,
                loser_shots_hit = loserShotsHit,
                winner_kills = winnerKills,
                loser_kills = loserKills,
                player1_series_score = series.Player1Score,
                player2_series_score = series.Player2Score,
                arena_name = series.ArenaName,
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            });

            await _connector.SendToAllSites(roundPayload, String.Format("round {0}", roundNumber));

            // Check if series is complete (first to 5 wins)
            if (series.Player1Score >= ROUNDS_TO_WIN || series.Player2Score >= ROUNDS_TO_WIN)
            {
                series.IsComplete = true;
                await CompleteSeries(arenaName);
            }
        }

        /// <summary>
        /// Complete a BO9 series and send the full summary to all sites
        /// </summary>
        private static async Task CompleteSeries(string arenaName)
        {
            if (!_activeSeries.ContainsKey(arenaName))
                return;

            var series = _activeSeries[arenaName];
            string winnerAlias = series.Player1Score >= ROUNDS_TO_WIN ? series.Player1Alias : series.Player2Alias;
            string finalScore = String.Format("{0}-{1}", series.Player1Score, series.Player2Score);

            // Calculate per-player aggregate stats
            int p1TotalShotsFired = 0, p1TotalShotsHit = 0, p1TotalKills = 0;
            int p2TotalShotsFired = 0, p2TotalShotsHit = 0, p2TotalKills = 0;

            foreach (var round in series.Rounds)
            {
                if (round.WinnerAlias.Equals(series.Player1Alias, StringComparison.OrdinalIgnoreCase))
                {
                    // Player 1 won this round
                    p1TotalShotsFired += round.WinnerShotsFired;
                    p1TotalShotsHit += round.WinnerShotsHit;
                    p1TotalKills += round.WinnerKills;
                    p2TotalShotsFired += round.LoserShotsFired;
                    p2TotalShotsHit += round.LoserShotsHit;
                    p2TotalKills += round.LoserKills;
                }
                else
                {
                    // Player 2 won this round
                    p2TotalShotsFired += round.WinnerShotsFired;
                    p2TotalShotsHit += round.WinnerShotsHit;
                    p2TotalKills += round.WinnerKills;
                    p1TotalShotsFired += round.LoserShotsFired;
                    p1TotalShotsHit += round.LoserShotsHit;
                    p1TotalKills += round.LoserKills;
                }
            }

            double p1Accuracy = p1TotalShotsFired > 0 ? Math.Round((double)p1TotalShotsHit / p1TotalShotsFired * 100, 2) : 0;
            double p2Accuracy = p2TotalShotsFired > 0 ? Math.Round((double)p2TotalShotsHit / p2TotalShotsFired * 100, 2) : 0;

            Console.WriteLine(String.Format("DuelingStats: BO9 COMPLETE - {0} wins {1} ({2})", winnerAlias, finalScore, arenaName));

            // Build series complete payload
            var seriesPayload = DuelingSiteConnector.BuildJsonString(new
            {
                action = "series_complete",
                series_id = series.SeriesId,
                player1_alias = series.Player1Alias,
                player2_alias = series.Player2Alias,
                winner_alias = winnerAlias,
                final_score = finalScore,
                total_rounds = series.Rounds.Count,
                total_duration_seconds = series.TotalDurationSeconds,
                player1_total_shots_fired = p1TotalShotsFired,
                player1_total_shots_hit = p1TotalShotsHit,
                player1_accuracy_pct = p1Accuracy,
                player1_total_kills = p1TotalKills,
                player2_total_shots_fired = p2TotalShotsFired,
                player2_total_shots_hit = p2TotalShotsHit,
                player2_accuracy_pct = p2Accuracy,
                player2_total_kills = p2TotalKills,
                arena_name = series.ArenaName,
                started_at = series.SeriesStartTime.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                completed_at = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            });

            await _connector.SendToAllSites(seriesPayload, "series complete");

            // Clean up completed series
            _activeSeries.Remove(arenaName);
        }

        /// <summary>
        /// Manually cancel/abort an active series in an arena
        /// </summary>
        public static void CancelSeries(string arenaName)
        {
            EnsureInitialized();

            if (_activeSeries.ContainsKey(arenaName))
            {
                var series = _activeSeries[arenaName];
                Console.WriteLine(String.Format("DuelingStats: Series cancelled in {0} ({1} vs {2}, score {3}-{4})",
                    arenaName, series.Player1Alias, series.Player2Alias, series.Player1Score, series.Player2Score));
                _activeSeries.Remove(arenaName);
            }
        }

        /// <summary>
        /// Get the current series state for an arena (null if no active series)
        /// </summary>
        public static DuelingSeriesState GetSeriesState(string arenaName)
        {
            EnsureInitialized();

            if (_activeSeries.ContainsKey(arenaName))
                return _activeSeries[arenaName];
            return null;
        }

        /// <summary>
        /// Test connectivity to all configured sites
        /// </summary>
        public static async Task TestConnection()
        {
            EnsureInitialized();
            await _connector.TestAllConnections();
        }

        /// <summary>
        /// Send test dueling data to verify the full pipeline
        /// </summary>
        public static async Task SendTestData()
        {
            EnsureInitialized();

            Console.WriteLine("DuelingStats: Sending test BO9 data...");

            string testArena = "TestDuelArena";
            StartSeries("TestPlayer1", "TestPlayer2", testArena);

            // Simulate a quick 5-round series (5-0)
            for (int i = 0; i < ROUNDS_TO_WIN; i++)
            {
                await RecordRound(
                    arenaName: testArena,
                    winnerAlias: "TestPlayer1",
                    loserAlias: "TestPlayer2",
                    winnerHpRemaining: 50 - (i * 5),
                    durationSeconds: 60 + (i * 15),
                    winnerShotsFired: 20 + i,
                    winnerShotsHit: 15 + i,
                    loserShotsFired: 18 + i,
                    loserShotsHit: 10 + i,
                    winnerKills: 3,
                    loserKills: 2
                );

                // Small delay between rounds
                await System.Threading.Tasks.Task.Delay(200);
            }

            Console.WriteLine("DuelingStats: Test data sent successfully");
        }
    }
}
