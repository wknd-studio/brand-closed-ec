import { DomainError } from "./domain-error";

// FR-017: 唯一の管理者は、他メンバーがいる場合は先に昇格させない限り退会・離脱できない
export class SoleAdminCannotLeaveError extends DomainError {
  constructor(readonly organizationId: string) {
    super(
      `唯一の管理者は他のメンバーを管理者に昇格させるまで組織を離脱できません: ${organizationId}`
    );
  }
}

// FR-023: 個人会員として登録済みのメールアドレスへの組織招待は拒否する
export class ExistingIndividualMemberEmailError extends DomainError {
  constructor(readonly email: string) {
    super(`既に個人会員として登録済みのメールアドレスです: ${email}`);
  }
}
