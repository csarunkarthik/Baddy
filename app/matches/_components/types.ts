// Shared types for the matches route (colocated — used by page.tsx, the
// useSessionStats hook, and the presentational components).

export type Player = { id: number; name: string; avatar?: string | null };
export type CoupleKey = "bamHari" | "arunDeep" | "avinashSharmili";

export type Match = {
  id: number;
  matchNumber: number;
  winner: "A" | "B" | null;
  teamAScore: number | null;
  teamBScore: number | null;
  teamA: Player[];
  teamB: Player[];
};

// A match is visually "completed" only when winner is set AND scores satisfy the win condition
// (one side ≥ 21 and the other is lower). If no scores are recorded, trust the winner field alone.
export function matchCompleted(m: Match): boolean {
  if (!m.winner) return false;
  if (m.teamAScore === null || m.teamBScore === null) return true;
  return m.teamAScore !== m.teamBScore && Math.max(m.teamAScore, m.teamBScore) >= 21;
}

export type Couple = { key: CoupleKey; label: string; bothAttending: boolean; player1Id?: number; player2Id?: number };

export type SessionInfo = {
  id: number;
  date: string;
  sport: "BADMINTON" | "PICKLEBALL";
  venue: string;
  totalMatches: number;
  bamHariKid: boolean;
  arunDeepKid: boolean;
  avinashSharmiliKid: boolean;
  finished: boolean;
  locked: boolean;
  attending: Player[];
};

export type MatchesPayload = {
  session: SessionInfo;
  matches: Match[];
  couples: Couple[];
  allPlayers: Player[];
  playerPriorPcts: Record<string, number>;
  playerPriorElos: Record<string, number>;
  playerSessionGains: Record<string, number>;
};

export type WinStat = { id: number; name: string; wins: number; played: number; winPct: number };

export type DivRow = { id: number; name: string; matchesPlayed: number; distinctPartners: number; coAttendees: number; diversity: number };

export type MvpRow = { id: number; name: string; wins: number; played: number; winPct: number; diversity: number; winsN: number; mvp: number };

export type PointsRow = { id: number; name: string; totalPoints: number; matchesScored: number; bestSingleMatch: number; pointsConceded: number; pointDiff: number; avgPoints: number };

export type SynergyRow = { p1: string; p2: string; wins: number; played: number; pct: number };

export type ImprovedRow = { name: string; todayPct: number; priorPct: number; delta: number };

export type MatchProb = { probA: number; probB: number; winnerProb: number | null };

export type EditDraft = { a1: number; a2: number; b1: number; b2: number };
