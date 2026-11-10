# postcard-generator

The postcard function: draws one travel-poster postcard per city with the OpenAI image API and stores it for the MyPreflight API.

Last reviewed: 2026-10-20

This repo is part of MyPreflight. The knowledge base lives in the product repo, [mypreflight/product](https://github.com/mypreflight/product). It is the primary source of truth for product decisions, standards and architecture. Read it by URL before working here:

- Start: https://raw.githubusercontent.com/mypreflight/product/main/CLAUDE.md
- Standards: https://raw.githubusercontent.com/mypreflight/product/main/technology/backend/standards.md
- Architecture: https://raw.githubusercontent.com/mypreflight/product/main/technology/backend/architecture.md
- Brand: https://raw.githubusercontent.com/mypreflight/product/main/product/brand/identity.md

If this file or the code contradicts the knowledge base, the knowledge base takes precedence. Flag the conflict; don't silently change either side.

## Repo-specific notes

Keep this short. Anything shared between repos belongs in the knowledge base.

- Run locally: `cp .env.dist .env`, then `docker compose up -d --build`. Compose also starts an OpenAI mock, so local runs cost nothing.
- Test: `docker compose exec app npm run lint`, `npm run typecheck`, `npm test` and `npm run test:functional`.
- Deploy: bump the version with `npm version <x.y.z> --no-git-tag-version`. Merging to `main` tags the version and applies the OpenTofu stack in `infra/` (`dflook/tofu-apply`, `production` environment), which deploys `dist.zip` from `./zip.sh` to the Lambda function. Pull requests run `tofu plan`.
- The Function URL is public; `src/lambda.ts` refuses anything without `Authorization: Bearer <POSTCARD_FUNCTION_SECRET>`. The stack generates the secret and publishes it with the URL at SSM `/mypreflight/postcard-generator/secret` and `/url`. Logs are in CloudWatch, `/aws/lambda/postcard-generator`.
- Every real render costs money. Refuse malformed input before calling the image API.
- Postcards are the one deliberate exception to "no AI-generated content" in MyPreflight. Don't extend AI generation elsewhere without a decision in the knowledge base.

When your change alters product behaviour, also open a PR to the knowledge base updating the matching file.
