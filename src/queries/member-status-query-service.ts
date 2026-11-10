// middleware のアクセス制御に使う会員の状態
export type MemberStatusDto = {
  onboardingCompleted: boolean;
  withdrawn: boolean;
};

// 会員の状態の読み取り。deleted_at は JWT に反映されないため、middleware は毎回これで確認する
export interface MemberStatusQueryService {
  // 行が無い会員は null。退会済みの行と有効な行が併存するときは有効な行の状態を返す
  findMemberStatus(clerkUserId: string): Promise<MemberStatusDto | null>;
}
