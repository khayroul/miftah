# Vercel Preview Setup (Phone Testing Anywhere)

This repo now includes `.github/workflows/vercel-deploy.yml`.

After one-time setup, every push to non-`main` creates a public Vercel preview URL.

## 1. Login and Link Project

From repo root:

```bash
cd /Users/Executor/miftah
npx vercel login
npx vercel link
```

When prompted:
- Scope: choose your Vercel account/team
- Link to existing project: `Yes` (or create `miftah` if not created yet)

## 2. Copy Org + Project IDs

After link, open:

```bash
cat .vercel/project.json
```

You will see:
- `orgId`
- `projectId`

## 3. Create Vercel Token

- Go to Vercel Dashboard -> Settings -> Tokens
- Create a token (for GitHub Actions)

## 4. Save GitHub Secrets

Run:

```bash
gh secret set VERCEL_TOKEN --body "YOUR_VERCEL_TOKEN"
gh secret set VERCEL_ORG_ID --body "YOUR_ORG_ID"
gh secret set VERCEL_PROJECT_ID --body "YOUR_PROJECT_ID"
```

## 5. Push and Verify

Push any branch:

```bash
git push origin <your-branch>
```

Then check:
- GitHub -> Actions -> `Vercel Deploy`
- Deployment output includes the public preview URL

Open that URL on your phone (mobile data is fine).
