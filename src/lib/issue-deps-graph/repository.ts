/**
 * 依存グラフを作る対象のリポジトリ。オーナー名を直接書くと、リポジトリをOrganizationへ移管したとき（#329）に
 * 書き換えが要るため、CIではGitHubが渡すGITHUB_REPOSITORYから、手元では gh repo view から取る
 */
export function repositoryFrom(
  githubRepository: string | undefined,
  ghRepoView: () => string
): { owner: string; name: string } {
  const nameWithOwner = (githubRepository || ghRepoView()).trim();
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(nameWithOwner);
  if (!match) {
    throw new Error(
      `リポジトリ名を owner/name の形で取れなかった: ${JSON.stringify(nameWithOwner)}`
    );
  }
  return { owner: match[1], name: match[2] };
}
