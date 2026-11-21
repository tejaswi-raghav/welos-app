# welOS collaboration and deployment security

Audit date: 2026-11-21 (Asia/Dubai). Repository: `tejaswi-raghav/welos-app`; default and production branch: `main`. This document distinguishes proposed repository changes from verified platform settings.

## Implementation status

The setup branch adds CODEOWNERS and contributor documentation, includes an importable ruleset definition, and narrows GitHub Actions permissions and deployment triggers. Application source, backend, dependencies, architecture, and `vercel.json` are unchanged. These files only take effect on `main` after the setup PR is merged.

The owner completed GitHub access confirmation and ruleset **27802355** was created. Its REST API response verifies **active** enforcement on `refs/heads/main`, one approval, required Code Owner review, stale-approval dismissal, latest-push approval, deletion prevention, force-push blocking, an empty bypass list, and `current_user_can_bypass: never`. [View the active ruleset](https://github.com/tejaswi-raghav/welos-app/rules/27802355). PR #7 is open and its merge state is blocked pending review. CODEOWNERS is still on the setup branch: sole-owner Code Owner enforcement becomes effective only after it reaches `main`. The connected GitHub App lacks administration/write permissions; owner-authenticated browser controls were used for settings and branch publication. The importable JSON remains a reusable definition, not proof of activation. No classic branch protection rules were listed in Settings → Branches.

## Verified GitHub protection and maintenance

1. Open [Settings → Rules → Rulesets](https://github.com/tejaswi-raghav/welos-app/settings/rules) to maintain the existing active ruleset. Do not import a duplicate. The JSON template is available for recovery or an explicitly requested migration.
2. Set name **welOS — Production Approval Protection**, enforcement **Active**, and target **Include by pattern → main** (equivalent to `refs/heads/main` in the API).
3. Leave the **Bypass list empty**. Enable **Restrict deletions**, **Block force pushes**, and **Require a pull request before merging**. Set **Required approvals: 1**, **Dismiss stale pull request approvals when new commits are pushed**, **Require review from Code Owners**, and **Require approval of the most recent reviewable push**. Leave **Restrict updates** off: the PR requirement blocks direct contributor pushes while permitting compliant merges; Restrict updates with no bypass would also block approved merges.
4. Save, reopen the ruleset, and verify every value. The ruleset must target only `main`, preserving feature branches. Review **Settings → Branches** for any classic rules; preserve stricter existing requirements. Required CI status checks were not added blindly: select the established PR checks after they have reported successfully, and avoid requiring a path-filtered firmware check on every PR.
5. Open [Settings → Collaborators](https://github.com/tejaswi-raghav/welos-app/settings/access) and confirm only the owner or specifically authorized administrators can administer security. The collaborator list was gated by GitHub access confirmation, so individual contributor roles remain unverified. This is a personal-account repository; do not assume organization-only role controls exist. If broader admin privileges are found, obtain owner approval before reducing access or removing anyone. Keep ordinary contributor access sufficient for branches and PRs. Review installed GitHub Apps and deploy keys for write or bypass capabilities.

The wildcard CODEOWNERS entry designates only `@tejaswi-raghav` for every file. Requiring Code Owner approval makes another contributor's approval insufficient. The `.github/` entry protects the ownership file, workflow files, and ruleset definition through the same owner review. Platform ruleset administration is controlled separately from repository files.

### Bootstrap and owner-authored PRs

GitHub evaluates CODEOWNERS from the PR's base branch. This setup PR cannot enforce its new ownership file before that file reaches `main`. The connected identity creating the setup PR is the owner; GitHub does not allow a PR author to approve their own PR. If the empty-bypass ruleset is activated first, another contributor must review this initial owner-authored PR, and the owner must explicitly inspect and merge it; the latest push must also be approved by somebody other than its pusher. Do not call that bootstrap review owner-code-owner enforcement. Coordinate the setup merge with the owner and immediately verify CODEOWNERS on `main` and the active ruleset together. Do not leave the bootstrap window unattended.

After activation, owner-authored PRs cannot satisfy a sole-owner Code Owner requirement without an explicit owner administrative intervention. Prefer having contributors author and push PRs while the owner reviews. Do not silently add contributor or app bypasses, a broad administrator bypass, or a second code owner. If the owner pushes the last reviewable commit on a contributor PR, another eligible reviewer must approve that push in addition to the required owner approval; preferably have the contributor make the final push.

## Vercel audit

The verified target is project `welos-app` (`prj_pBTxcOJeutdWBpO6aLLbdcIBMYbq`) in team `vo1d` (`team_o95r9FabLB9mEujc0Wj99RqI`), rather than the team's separate `welos` or `welos-sentinel` projects.

Verified through the authenticated dashboard and connector:

- [Settings → Git](https://vercel.com/vo1d/welos-app/settings/git) is connected to `tejaswi-raghav/welos-app`. It reports **no deploy hooks**. The Git integration was preserved.
- [Settings → Environments → Production](https://vercel.com/vo1d/welos-app/settings/environments/production) tracks **main** and has **Auto-assign Custom Production Domains enabled**. No setting change was necessary.
- The latest inspected production deployment was READY and associated with merge commit `1c4341463fbd9fae492e3135b0eab17e04903f86` on `main`; preceding feature-branch deployments had a preview target (`target: null`), separate from production. This is historical evidence, not a new deployment test.
- The team membership API returned one confirmed member, the owner linked to GitHub `tejaswi-raghav`. No contributor team members were listed. The Hobby project's Project Members screen indicates granular project-role assignment requires Enterprise. The access-groups API returned 403; access-group membership could not be independently enumerated. Do not infer granular role enforcement from an unavailable API.
- Existing Vercel deployment protection remains in place. Authentication for viewing a deployment does not control who can create or promote production deployments.

### Alternative production paths and owner follow-up

Vercel CLI/API deployments with production authority, dashboard promotion/redeployment/rollback, production-domain reassignment, account sessions, authorized apps, and production-capable tokens operate independently of GitHub Code Owner review. No deployment attempt was made to test those paths. Team membership shows no other member, but it cannot prove owner credentials have never been shared.

The authenticated [Account → Settings → Tokens](https://vercel.com/account/settings/tokens) **Active** inventory was inspected as metadata only. It listed dashboard sign-in sessions and ChatGPT/Toolbar app authorizations; no standalone manually created deployment token appeared in the active inventory. No token value was retrieved, printed, created, or revoked. The owner must confirm all active sessions and app authorizations are recognized and not shared, and approve any revocation separately. The dashboard also displayed an **Enable 2FA** prompt: review [Account → Authentication](https://vercel.com/account/settings/authentication) and enable it if it is not already configured. Credential setup must be completed by the owner.

Keep contributors in GitHub for normal branch development and preview builds. If Vercel access is needed later, use a plan-supported role without direct production deployment, promotion, rollback, domain administration, or Full Production Deployment permissions. Do not assume a role named Developer is sufficient without inspecting its effective rights and extended permissions. Never share an owner token. Inspect the team's installed integrations and any external CI systems for production-capable credentials; these were not exhaustively verified. Obtain explicit approval before revoking credentials or removing collaborators. No collaborator was removed and no credential was revoked.

## GitHub Actions audit and changes

The inspected base branch contained two workflows:

| Workflow | Original behavior | Setup PR behavior |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | Builds on main push or manual dispatch, then deploys GitHub Pages; Pages and OIDC write permissions apply to the whole workflow | PRs run `npm ci` and the existing `npm run check`; only a push on `main` uploads the Pages artifact and runs the deployment job; manual dispatch removed; Pages/OIDC writes scoped to the deployment job |
| `.github/workflows/firmware.yml` | PlatformIO build on firmware pushes and PRs; token permissions inherit repository defaults | Same firmware CI retained, with explicit `contents: read` and non-persistent checkout credentials |

Neither original workflow referenced Vercel tokens, called Vercel production deploy commands, wrote to `main`, used `pull_request_target`, or declared a branch-protection bypass. Package scripts contain no deployment commands. The Pages manual-dispatch path was an independent publishing surface; its effective protection depended on the environment settings. The setup PR removes that trigger while retaining legitimate Pages deployment and PR checks. Existing workflow versions on feature branches are not a security boundary, so platform environment restrictions remain necessary.

Verified platform settings and remaining follow-up:

1. **Settings → Environments → github-pages → Deployment branches and tags → Selected branches and tags → main only**. This prevents an altered feature-branch workflow from publishing Pages through the named environment. Review other environments for production deployment credentials. Applied and verified: the environment now has a single Branch rule `main`, with no tag rule. It has no environment secrets or variables.
2. **Settings → Actions → General → Workflow permissions → Read repository contents and packages permissions**; leave **Allow GitHub Actions to create and approve pull requests** disabled. Explicit workflow permissions in this PR are scoped independently. Verified: read-only defaults are already selected and workflow-created PR approval is disabled. No default change was necessary.
3. **Settings → Secrets and variables → Actions**, and each environment's secrets: inspect names and scope only. Production Vercel credentials should not be available to feature-branch workflows. If an external deployment workflow must exist, use an environment restricted to `main`, require owner review, and prevent self-review where supported. Ask the owner before moving or revoking existing secrets. The authenticated Actions secrets page reports no repository secrets and no environment secrets. Values were not retrieved.
4. **Settings → Deploy keys**, **Webhooks**, and **GitHub Apps**: review write permissions, privileged integrations, and external deploy destinations. Verified: no deploy keys and no webhook entries were listed. Installed repository GitHub Apps include Claude and Vercel; their complete account-level permissions and external CI credentials still require owner review. The active ruleset grants no app bypass. Pin third-party Actions to reviewed commit SHAs as a follow-up; action version tags are mutable.

No extra Vercel deployment workflow or script was added. Vercel continues to deploy through its Git integration.

## Verification and manual acceptance procedure

All 25 existing application tests passed locally. GitHub CI run [44930786324](https://github.com/tejaswi-raghav/welos-app/actions/runs/44930786324) passed `npm ci` and `npm run check` (tests plus Vite build); Pages artifact upload and deployment were correctly skipped for the PR. YAML/JSON parsing and whitespace validation passed. Full local dependency installation stalled and was stopped; the build was verified through CI. Remote file contents were independently checked against the prepared files before this status update.

Do not make dummy commits on `main`, perform an unapproved merge, or initiate a production deployment just to test controls. Configuration inspection does not substitute for an independent contributor account test.

| Scenario | Expected after activation | Evidence / safe verification |
| --- | --- | --- |
| Feature branch push | Allowed | Setup branch publication tests the connected owner identity only; have a contributor push their next legitimate feature change |
| Open PR | Allowed | Setup PR tests creation for the connected identity; contributor opens a legitimate ready-for-review PR |
| Direct push to main | Blocked | Verify active PR rule and empty bypass list; do not attempt a real main push |
| Self-approval | Cannot satisfy approval | GitHub disallows author approval; inspect review UI on a contributor PR |
| Another contributor approval | Owner still required | With CODEOWNERS on main, inspect merge requirements after a non-owner review; do not merge |
| Owner approval | Owner requirement satisfied | Owner reviews a contributor-authored PR whose latest push came from the contributor; check merge requirements |
| New commit after approval | Reapproval required | On that feature branch, push a legitimate follow-up and observe dismissed approval |
| Unapproved PR merge | Blocked | Inspect disabled merge state and required owner review; do not attempt to bypass |
| Approved PR merge | Allowed when all applicable checks pass | Observe the next legitimate owner-approved merge |
| Approved merge reaches Vercel | Automatic production deployment | Configuration and historical main merge evidence verified; observe the next legitimate merge's SHA in Vercel |
| Contributor direct production deployment | Denied without separate authorization | No other team member listed; review effective credentials/roles, then use a non-production permission review with the contributor; do not create a production deployment |

No cross-account contributor denial tests, owner approval tests, or new production deployment tests have been performed. Remaining completion gates: merge the reviewed setup PR so CODEOWNERS reaches main, verify individual collaborator permissions, and finish the independent credential/integration access review. The ruleset and Pages branch restriction are verified active.

## Official references

- [GitHub Code Owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [GitHub ruleset controls](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [Vercel access roles](https://vercel.com/docs/rbac/access-roles)
- [Vercel deploy hooks](https://vercel.com/docs/deploy-hooks)
