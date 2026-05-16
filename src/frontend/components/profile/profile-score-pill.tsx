import { scorePillClasses } from "@/shared/user-profile-page";

export function ProfileScorePill({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex min-w-[3rem] items-center justify-center rounded-full px-2.5 py-1 text-lg font-bold tabular-nums ${scorePillClasses(score)}`}
    >
      {score.toFixed(1)}
    </span>
  );
}
