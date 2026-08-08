# Research: 法人会員（B2B）対応

## R1: Clerk Organizationsのロール設計

**Decision**: Clerk標準のロールスロット `org:admin` / `org:member` をそのまま使う（カスタムロールを新設しない）。

**Rationale**: Clerk標準機能のため、招待UI・組織切り替えUI(`<OrganizationSwitcher>`等)・権限チェックヘルパーの標準サポートをそのまま受けられる。独自ロール名を定義すると、Clerk側のUIコンポーネントとの整合を都度自前で維持するコストが発生する。

**Alternatives considered**: `org:owner`/`org:staff`等の独自ロール名 → 標準コンポーネントとの互換性を保つための追加実装が必要になり、メリットがないため却下。

---

## R2: RLSでの組織スコープ判定

**Decision**: Clerkのセッションに含まれるアクティブ組織のClerk Organization ID (`org_id` claim) をJWTから読み取り、既存の `get_current_user_id()` と対称的な `get_current_org_id()`（SECURITY DEFINER関数）で `organizations.id` にマッピングする。ユーザーがアクティブ組織を選択していない場合は `org_id` がnullになるため、個人コンテキストとして扱う。

**Rationale**: 既存の `get_current_user_id()` と同じ設計パターンを踏襲でき、レビューコストが下がる（`docs/architecture-refactoring.md` の一貫性原則）。RLSポリシー内で完結する判定のため、API Route側の権限チェック漏れがあってもDB層で最終的に防御できる。

**Alternatives considered**: API Route内で毎回 `organization_memberships` をJOINして確認しRLSに頼らない方式 → RLSという最終防衛ラインを放棄することになり、既存の設計方針（`docs/adr/002-supabase-rls.md`）と矛盾するため却下。

---

## R3: 法人ランクの値の再利用

**Decision**: `organizations.rank` は既存の `MemberRank`（`src/domain/value-objects/member-rank.ts` で定義済みの7段階モデル。具体的なランク名・上限額はここに書き写さず、コードを単一情報源とする）をそのまま再利用する。DBの`member_rank` ENUM型には旧5段階モデルの値（`free`/`entry`）が削除されずに残っている（未完了の技術的負債）が、本機能はアプリケーション層で使われている現行の7段階モデルのみを対象とし、この既存の負債の解消は本specのスコープ外とする。

**Rationale**: Constitution原則V「事実の単一情報源化」。ランク名・月次上限額をorganizations用に複製すると、値を変更する際に2箇所を同期する必要が生じ、既存の「4箇所に重複していた月次上限ロジック」と同じ問題を再発させる。

**Alternatives considered**: 法人専用のランク体系を新設 → 現時点で法人固有のランク要件（スペックのFR-003は「組織単位で管理」とのみ規定）がないため、過剰設計。将来法人限定プランが必要になった時点で別途検討する。

---

## R4: 注文の承認待ち状態のモデリング

**Decision**: `orders.status`（既存のOrderStatus enum）に新しい値 `pending_approval` を追加し、承認されたら既存の `pending_payment` / `confirming` に遷移させる。`orders.approval_status`（auto_approved/pending_approval/approved/rejected）は誰が・いつ承認/却下したかの記録用の付随情報として別途持つ。

**Rationale**: 既存の管理画面（`src/app/admin/orders/[id]`）のステータス表示・遷移ロジックがOrderStatus enumを前提に組まれているため、そこに自然に組み込める。`approval_status` だけで管理すると、管理画面のステータス一覧・フィルタに「承認待ち」を通すための特別分岐が別途必要になり複雑化する。

**Alternatives considered**: `orders.status` は個人会員と完全共通のまま何も追加せず `approval_status` のみで制御 → Admin UIのステータスバッジ・フィルタ実装が二重管理になるため却下。

---

## R5: organization_membershipsの同期方式

**Decision**: Clerk webhook（`organizationMembership.created` / `.updated` / `.deleted`）でベストエフォート同期する。加えて、招待受諾直後の画面遷移などクリティカルな導線では、use-case内で明示的にupsertして整合性を担保する。

**Rationale**: 既存の `users` テーブルが `user.created` webhook + オンボーディングでのupsert（`docs/signup-flow.md`）という同じ二重化パターンをすでに採用しており、一貫性がある。webhookは配信保証がないため、単独では信頼できない。

**Alternatives considered**: webhookのみに依存 → 配信遅延・失敗時に「参加したはずなのにメンバー一覧に出ない」という体験劣化が起きるため却下。

---

## R6: 唯一の管理者退会ブロックの実装方式

**Decision**: `src/use-cases/withdraw.ts` は既に実装済みで、`orderRepo.findActiveByUserId()` の結果が空でない場合に `ActiveOrdersExistError` を投げるゲートチェックをすでに持っている。ここに「自分が組織の唯一のorg:adminである場合はブロックする」という条件を追加する形で実装する（`SoleAdminCannotLeaveError`を新設し、同じ早期リターンパターンに追加）。

**Rationale**: 退会時のゲートチェック機構は`[[project_withdrawal_future]]`で言及されていた通り実装済みであることが判明した（当初の想定は「今後実装される」だったが、実際には既存コード`src/use-cases/withdraw.ts`がすでにこのパターンを持っていた）。既存の条件分岐に1つ足すだけで済み、新しい退会フローを法人向けに別実装する必要はない。

**Alternatives considered**: 組織管理画面側で個別に退会ブロックを実装 → 退会の入口が複数になり、チェック漏れのリスクが増えるため却下。

---

## R9: 個人会員の氏名フィールドの既存不備

**Decision**: `src/use-cases/select-plan.ts` の `SelectPlanInput` はすでに `firstName` / `lastName` を受け取るが、`User`ドメインエンティティ（`src/domain/entities/user.ts`）にはこれらのフィールドが定義されておらず、`User.of()` / `.with()` に渡されないまま握りつぶされている（DBの`users.first_name`/`last_name`列も、リポジトリ層で一切参照されていない）。本機能でこの穴を埋める：`User`エンティティに`firstName`/`lastName`/`phoneNumber`を追加し、`UserRepository`実装（`supabase-user-repository.ts`）でDBカラムとマッピングする。

**Rationale**: 「氏名・電話番号の入力を必須にする」というUser Story 2の要件は、UI側でバリデーションを追加するだけでは達成できない。ドメインエンティティが値を保持していない以上、そもそも永続化のパイプラインが繋がっていないため、UI→UseCase→Entity→Repositoryの全層を貫通させる必要がある。

**Alternatives considered**: なし（既存のバグ的ギャップであり、選択の余地なく修正が必要）。

---

## R10: 個人会員と法人組織メンバーの排他性

**Decision**: 個人会員としての購入機能（`users.rank`等）と法人組織メンバーとしての購入機能は排他的に扱う。同一ユーザーが個人会員でありながら法人組織にも所属する、という状態は許可しない（FR-022）。一方、法人組織を複数兼務すること（1ユーザーN組織）は許可する。

**Rationale**: 当初「個人・法人の両立」を許可する案を検討したが、以下の理由で撤回した。
1. Amazon Businessのような「個人⇄法人アカウントの両立」が価値を持つのは、その基盤に巨大な個人向けマーケットプレイスが既に存在するケースであり、本サービスのような招待制クローズドB2B卸ECには当てはまらない。法人代表者が「会社とは無関係に個人としてもこのクローズドECで買い物したい」という需要は考えにくい。
2. 両立を許可すると、アクティブコンテキスト（個人 or 組織）の解決ロジック、`users.rank`の意味論の曖昧さ（未使用なのか個人用として有効なのか）、二重のオンボーディングゲートといった複雑さが実装全体に波及する。要求されていた「1ユーザーN組織」（複数法人の兼務）はこの複雑さを必要としない別の要件であり、混同していた。
3. 排他的にすることで、コンテキスト解決は「複数所属している場合、どの組織か」の1次元のみになり、「個人か組織か」という2次元目が消える。

**Alternatives considered**: 個人・法人の両立を許可する（当初案） → 実装複雑度に見合う具体的な業務要件が確認できなかったため却下。将来的に明確な需要が確認された場合は別途再検討する。

---

## R11: ランク参照の一元化（FR-024）

**Decision**: `user.rank` を直接参照している既存コード全て（`src/app/(member)/shop/page.tsx`、`shop/[brand]/page.tsx`、`shop/[brand]/[id]/page.tsx`、`shop/[brand]/actions.ts`、`order/checkout/page.tsx`、`src/use-cases/place-order.ts`、`src/lib/cart/monthly-confirmed.ts` の計7箇所を実コード調査で確認）を、新設する単一の解決関数（例: `resolveMemberContext(clerkUserId, activeOrganizationId?)`）経由に置き換える。この関数が「個人としてのランク・月次上限」か「アクティブな組織としてのランク・月次上限」かをFR-022のルールに基づいて一意に返し、呼び出し側は個人/組織の区別を意識しない。

**Rationale**: `users.rank`はDBスキーマ上`NOT NULL DEFAULT`（現行は`'starter'`）であり、法人組織のみに所属するユーザーでもnullにはならず、意味を持たない既定値が入り続ける。この値を既存の7箇所が直接参照し続けると、組織のランクではなく個人の（未使用の）既定値でカタログ閲覧制御・月次上限計算が行われてしまう実害のあるバグになる。一元化された解決関数を経由させることで、個人会員は既存と全く同じ値を得る（挙動不変、FR-013）一方、法人組織メンバーは正しく組織のランクを参照できる。

**Alternatives considered**:
- `users.rank`をnullableに変更する → `User`エンティティ・`MemberRank`型（null非許容）・既存の個人会員フロー全体への型変更の波及が大きく、「個人会員フローを変更しない」制約（FR-013）に反するリスクが高いため却下。
- `users`と`organizations`を統合したポリモーフィックな「アカウント」テーブルに再設計する → 既存`users`テーブル・`User`エンティティの大規模な作り変えが必要になり、このコードベースに前例のない設計パターンを持ち込むことになるため却下。

---

## R7: 個人会員のプロフィール情報必須化の実装方式

**Decision**: `users.first_name` / `last_name` / 新設 `phone_number` のいずれかが空の場合、既存の`src/middleware.ts`が持つ「オンボーディング未完了時のリダイレクト」「退会済み会員へのアクセス制御」と同じゲートチェックパターンに、プロフィール未完了判定を追加する。新規サインアップはオンボーディング完了前に、既存会員は次回ログイン時にこのゲートで捕捉される。

**Rationale**: すでに同種のゲートチェック機構がmiddleware内に存在し、そこに条件を1つ追加するだけで新規・既存両方のケースを一箇所で扱える。DBレベルで`NOT NULL`制約を課すと、既存の空文字レコードに対する一斉バックフィル（マイグレーション）が必要になり、リリースタイミングの制約が増える。

**Alternatives considered**: `users`テーブルにNOT NULL制約を追加し、マイグレーション時に全既存レコードへ強制的な値埋め・エラーを発生させる → 既存データを持つ本番DBに対して破壊的であり、既存会員の体験を不必要に損なうため却下。

---

## R8: 法人の本店所在地の保存場所

**Decision**: 法人の本店所在地（公式な登記住所相当の1件のみの情報）は`addresses`テーブルではなく`organizations`テーブルに直接カラムとして持つ。

**Rationale**: `addresses`テーブルは「1ユーザー/1組織が複数件持てる配送先・請求先」という多対一の設計を前提にしている（`is_default`等）。本店所在地は組織に対して常に1件のみ存在する公式情報であり、性質が異なる。無理に`addresses`に格納すると「本店所在地用のtype」を特別扱いする分岐が随所に必要になる。

**Alternatives considered**: `addresses.type`に`headquarters`を追加し`addresses`で管理 → 配送先選択UIに本店所在地が紛れ込まないための除外分岐が必要になり、複雑化するため却下。
