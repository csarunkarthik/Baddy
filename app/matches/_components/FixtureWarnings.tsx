export default function FixtureWarnings({
  violated,
  droppedFromAttendance,
}: {
  violated: string | null;
  droppedFromAttendance: boolean;
}) {
  if (!violated && !droppedFromAttendance) return null;

  return (
    <div className="px-4 py-1.5 text-[11px] font-semibold bg-warn/10 text-amber-400 border-b border-warn/20">
      {violated && <>⚠ {violated} both in this match. </>}
      {droppedFromAttendance && <>⚠ Includes a player no longer attending.</>}
    </div>
  );
}
