import { Box, Card, Container, Heading, Stack, Text } from "@sanity/ui";

interface Section {
  title: string;
  body: React.ReactNode;
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <Text size={1} as="li">
      {children}
    </Text>
  );
}

const SECTIONS: Section[] = [
  {
    title: "1. 商品登録の基本的な流れ",
    body: (
      <Stack space={3}>
        <Text size={1}>
          商品を1件登録する前に、以下の順番で準備が必要です（すでに存在するものは飛ばしてOK）。
        </Text>
        <Stack space={2} as="ol" style={{ paddingLeft: "1.25em" }}>
          <Step>
            「商品管理 →
            ブランド」で商品のブランドを作成する（ブランド名は必須。ロゴ・説明・デザインテーマは任意）
          </Step>
          <Step>
            「商品管理 →
            カテゴリ」で商品のカテゴリを作成する（未整備でも商品は登録できる）
          </Step>
          <Step>
            掛け率を個別に管理したい場合は「商品管理 →
            価格設定（デフォルト掛け率）」で設定を作成し、ブランドまたは商品にアタッチする（詳しくは下の「2.
            価格・掛け率の仕組み」を参照）
          </Step>
          <Step>
            「商品管理 →
            すべての商品」から「+」で商品を新規作成する。商品名・ブランド・参考小売価格（定価）は必須
          </Step>
        </Stack>
        <Text size={1} muted>
          業者からCSVでまとまったデータをもらえる場合は、1件ずつ手動登録するより「3.
          CSVインポートの使い方」を使う方が早いです。
        </Text>
      </Stack>
    ),
  },
  {
    title: "2. 価格・掛け率の仕組み",
    body: (
      <Stack space={3}>
        <Text size={1}>
          会員ランク別の仕入れ価格（「ランク別仕入れ価格」欄）は手入力ではなく、以下の優先順位で自動計算されます。
        </Text>
        <Stack space={1} as="ol" style={{ paddingLeft: "1.25em" }}>
          <Step>
            商品自身に設定した「ランク別掛け率」（最優先・商品ごとの個別上書き）
          </Step>
          <Step>
            商品にアタッチした「掛け率設定」（`price_settings`）のランク別掛け率
          </Step>
          <Step>ブランドにアタッチした「掛け率設定」のランク別掛け率</Step>
          <Step>
            「デフォルトにする」がONになっている「掛け率設定」（全商品共通の最終フォールバック）
          </Step>
        </Stack>
        <Text size={1}>
          定価と掛け率が決まれば、ランク別仕入れ価格は自動的に計算・保存されます（直接編集はできません）。定価や掛け率を変更すれば自動で再計算されます。
        </Text>
        <Card padding={3} radius={2} tone="caution">
          <Text size={1}>
            「仕入れ掛け率（%）※運営者専用」（`vendor_cost_rate`）は、業者から提示された仕入れ値の参考情報であり、会員向けのランク別価格の計算には一切使いません。この値を下回るランク価格を設定しようとすると、赤字防止のため保存がブロックされます。
          </Text>
        </Card>
      </Stack>
    ),
  },
  {
    title: "3. CSVインポートの使い方",
    body: (
      <Stack space={3}>
        <Text size={1}>
          業者から提供されたCSVファイルを一括で商品として取り込めます。上部タブの「商品CSVインポート」ツールを使います。
        </Text>
        <Stack space={2} as="ol" style={{ paddingLeft: "1.25em" }}>
          <Step>
            商品のブランドが未登録の場合は、先に「商品管理 →
            ブランド」で作成しておく
          </Step>
          <Step>
            「商品管理 →
            商品データソース（CSV）」で、業者のCSVファイル1本ごとにドキュメントを作成する。「CSV列マッピング」でサンプルCSVをアップロードすると、実際の列名から選べる。案内文や空行が先頭にあるCSVは、プレビューから正しいヘッダー行を選択する。CSVにブランド列が無い場合は「デフォルトブランド」も設定する
          </Step>
          <Step>
            「商品CSVインポート」タブを開き、1.データソースを選択 → 2.
            CSVファイルを選択 → 3. 検証プレビューを表示 →
            内容を確認して問題なければ 4. 実行を確定する、の順に進める
          </Step>
          <Step>
            実行結果は「商品管理 →
            インポート実行結果」から後で確認できる（成功・失敗件数、エラーの詳細）
          </Step>
        </Stack>
        <Card padding={3} radius={2} tone="caution">
          <Text size={1}>
            同じCSVを再度インポートすると、JANコード（無ければ商品名+ブランド名）が一致する既存商品は上書き更新されます。手動で個別調整した項目が意図せず戻ってしまうことがあるため、再インポート前に社内で運用ルールを確認してください。
          </Text>
        </Card>
      </Stack>
    ),
  },
  {
    title: "4. スクレイピングのデータソースについて",
    body: (
      <Stack space={2}>
        <Text size={1}>
          「商品管理 →
          商品データソース（スクレイピング）」は、業者サイトを定期的に自動収集するための設定です。開発者がスクレイピング用のコードと一緒に用意するもので、Studio上では新規作成・編集・削除ができません（閲覧のみ）。
        </Text>
        <Text size={1} muted>
          設定を追加・変更したい場合は開発者に依頼してください。
        </Text>
      </Stack>
    ),
  },
  {
    title: "5. インポート実行結果の見方",
    body: (
      <Stack space={2}>
        <Text size={1}>
          「商品管理 →
          インポート実行結果」には、CSV手動インポート・スクレイピング自動収集どちらの実行履歴も同じ形式で記録されます。成功件数・失敗件数・要確認件数と、失敗した行の詳細（対象と理由）が確認できます。この一覧は監査用の記録のため、内容の編集はできません（古い記録の削除のみ可能です）。
        </Text>
      </Stack>
    ),
  },
  {
    title: "6. 商品の絞り込み・一括削除",
    body: (
      <Stack space={2}>
        <Text size={1}>
          「商品管理 →
          すべての商品」の一覧右上には検索・絞り込み機能があり、在庫状況・ブランド・カテゴリなど任意の項目で絞り込めます。また一覧の「Select」から複数選択して一括削除もできます。
        </Text>
      </Stack>
    ),
  },
];

/**
 * 商品登録・CSVインポート等の運用手順を、開発者でなくても読めるようにする
 * Sanity Studioのツールタブ（ユーザーからの要望: 「画面上のタブにマニュアルを」）。
 * ドキュメントの中身ではなく、Studioの使い方そのものを説明するための静的コンテンツなので、
 * 特定のドキュメントに依存しない独立したツールとして実装している。
 */
export function ManualTool() {
  return (
    <Container width={2} padding={4}>
      <Stack space={5}>
        <Heading size={3}>運用マニュアル</Heading>
        <Text size={1} muted>
          商品登録・CSVインポートなどの運用手順をまとめています。開発者に確認しなくてもここを読めば作業できるようにするためのページです。
        </Text>
        {SECTIONS.map((section) => (
          <Card key={section.title} padding={4} radius={3} shadow={1}>
            <Stack space={3}>
              <Heading size={1}>{section.title}</Heading>
              <Box>{section.body}</Box>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
