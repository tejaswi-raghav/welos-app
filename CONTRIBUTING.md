# Contributing to welOS

Create a feature branch from the latest `main`, make your change, and open a pull request into `main`:

```sh
git switch main
git pull --ff-only origin main
git switch -c feature/your-change
npm ci
npm run check
git add <changed-files>
git commit -m "Describe your change"
git push -u origin feature/your-change
```

Run `npm run firmware:build` for firmware changes (requires PlatformIO). Never commit credentials, `.env` files, or downloaded production environment files.

Mark the PR ready for review and request `@tejaswi-raghav`. GitHub uses the CODEOWNERS file on the base branch to request owner review automatically for ready PRs after this setup has been merged. Draft PRs do not automatically request code-owner review. An approval from another contributor cannot replace the owner's approval once the ruleset and CODEOWNERS are active.

Use the Vercel preview linked to your PR where you have access. Previews are separate from the production website. Do not use production tokens, deploy hooks, CLI production deployments, promotion, rollback, or domain reassignment to publish your branch.

Address feedback on the same branch. New reviewable commits dismiss old approvals and require a fresh review. Keep the most recent push with the contributor: the required reviewer cannot satisfy the latest-push requirement if they made that push. GitHub does not allow authors to approve their own PRs, so owner-authored PRs require an owner-controlled administrative decision; do not give contributors bypass permissions to solve this.

After the owner approves the final changes and applicable checks pass, merge the PR through GitHub. With Vercel Git integration enabled, merging into `main` automatically builds and deploys production. Approval alone does not deploy. Feature branch pushes and PRs remain available for normal collaboration.

Do not push directly to `main`, force-push or delete it, change CODEOWNERS without owner review, or change platform security settings. See [SECURITY_SETUP.md](SECURITY_SETUP.md) for activation status, bootstrap steps, platform controls, and verification.
