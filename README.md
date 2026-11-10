<div align="center">

[![postcard-generator][banner]][homepage]

The city artwork function of the [**MyPreflight**][homepage] platform. Draws a bespoke, flat-vector travel
poster for any city on demand, as an AWS Lambda function.

</div>

## About

**MyPreflight** is a briefing service and electronic flight board app for your virtual flights, providing you realistic
figures, checklists, procedures and data to perform your flight like a real pilots do. You can customize your
experience, integrate with SimBrief and other tools. Check out our homepage at [mypreflight.io][homepage].

**This module** is a serverless function that turns a city name into a piece of artwork the platform can show beside a
flight:

- renders a full-bleed vertical 3:4 travel poster with the [OpenAI image API][openai-images],
- composes the whole brief — landmark, figures, palette, typography — from one city name, so a destination never needs
  a hand-made asset,
- sets the city in uppercase as the only lettering, in English,
- stores the poster in S3 under a uuid the caller chooses, served through CloudFront, and answers with where it landed,
- refuses malformed arguments before a single image is paid for,
- caches identical requests for a day, for as long as the instance stays warm.

It exists as a separate service because image generation is slow, expensive and bursty — a poster takes tens of seconds
and costs real money, while the rest of the backend answers in milliseconds for free. Keeping it out of the API means a
slow render never occupies a backend worker, and a rate-limited or refused prompt degrades one picture rather than a
whole request.

The backend lives in [flight-tracker-api][repo-api], the web app in [flight-tracker-app][repo-app], the desktop
companion in [flight-tracker-transponder-app][repo-transponder] and the seat map functions in
[aerolopa-provider][repo-aerolopa].

[![integrity][ci-badge]][ci-url]
[![release][release-badge]][release-url]
[![license][license-badge]][license-url]

### Built with

[![TypeScript][ts-badge]][ts-url]
[![Node.js][node-shield]][node-url]
[![OpenAI][openai-badge]][openai-url]
[![Biome][biome-badge]][biome-url]
[![Cucumber][cucumber-badge]][cucumber-url]
[![Docker][docker-badge]][docker-url]

No runtime dependencies at all — the function is the standard library plus TypeScript bundled by esbuild into one file,
which keeps the deployed artifact small and the cold start immediate.

## Getting started

### Environment

This app uses docker-based virtualization to run. To set up the project, follow these steps:

1. Clone the project by running:

   ```shell
   git clone git@github.com:mypreflight/postcard-generator.git
   ```

2. Prepare an environment variable file by copying `.env.dist` to `.env` and fill it with your data.

   ```shell
   cd postcard-generator
   cp .env.dist .env
   ```

3. Use docker compose to set up the environment

   ```shell
   docker compose up -d --build
   ```

   Packages will be installed automatically and the service starts in watch mode.

4. Your project should be up and running. `docker compose` also starts an `openai-mock` container, so the function
   answers a tiny stand-in image without spending anything. The dev server wraps the same handler Lambda calls, so it
   wants the `POSTCARD_FUNCTION_SECRET` from your `.env` as a bearer token:

   ```shell
   curl -H "Authorization: Bearer $POSTCARD_FUNCTION_SECRET" \
     "http://localhost:3001/city?city=Munich&country=Germany&continent=Europe&uuid=$(uuidgen | tr 'A-Z' 'a-z')"
   ```

   `S3_ENDPOINT` points at the same mock, so nothing is uploaded either. Point `OPENAI_API_HOST` at
   `https://api.openai.com` with a real `OPENAI_API_KEY`, and unset `S3_ENDPOINT` with AWS credentials allowed to write
   the bucket, to draw and store for real.

### On-demand by design

The function runs on AWS Lambda behind a Function URL. It scales to zero, costs nothing while nobody is asking for a
city, and starts on the first request, which fits a render the backend stores permanently and therefore asks for once
per destination.

```shell
URL=$(aws ssm get-parameter --name /mypreflight/postcard-generator/url --query Parameter.Value --output text)
SECRET=$(aws ssm get-parameter --name /mypreflight/postcard-generator/secret --with-decryption \
  --query Parameter.Value --output text)
curl -H "Authorization: Bearer $SECRET" \
  "$URL/city?city=Munich&country=Germany&continent=Europe&uuid=$UUID"
```

The Function URL is public, with auth type `NONE`, so the function guards it with a shared secret: every request must
carry it as `Authorization: Bearer <secret>`, compared in constant time before anything else runs. That secret is doing
more than hiding an implementation detail here: every unguarded call would spend money at OpenAI.

The repository is one package. `src/lambda.ts` is the entry point Lambda calls (`lambda.handler`), bundled by esbuild
into a single `dist/lambda.js`, and `scripts/dev-server.ts` wraps that same handler in a throwaway HTTP server so
`docker compose up` gives you something to curl; it is never deployed.

Its timeout is five minutes and its memory 512 MB, set in `infra/lambda.tf`, because a high-quality render regularly
takes tens of seconds and occasionally minutes.

### API documentation

The contract is `openapi.json` in the repository root — `GET /city`, requiring `Authorization: Bearer <secret>`. It is
the source of truth: `flight-tracker-api` vendors it and mirrors it in hand-written types.

The function takes query parameters:

| Argument    | Default      | Meaning                                                                       |
| ----------- | ------------ | ----------------------------------------------------------------------------- |
| `city`      | — (required) | The city to draw.                                                             |
| `country`   | — (required) | The country it is in, in English. Settles which city is meant.                 |
| `continent` | — (required) | The continent it is on, in English.                                           |
| `uuid`      | — (required) | Names the stored object. Lowercased; anything but a uuid is refused.           |

**Those four are the whole parameter surface.** What is drawn and how — the prompt, the size, the quality, the format
and the JPEG compression — is the function's own configuration, read from its environment at cold start. A caller
names a place and an object and has no say over the render, so no caller can drive up the spend or put words in the
prompt. Anything else that arrives is ignored rather than honoured.

It answers with where the postcard was stored and what it was drawn from — the `prompt` and the render settings are
output, an echo of the configuration above, so a render can be attributed or reproduced later:

```json
{
  "city": "Munich",
  "country": "Germany",
  "continent": "Europe",
  "uuid": "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  "model": "gpt-image-2",
  "size": "1152x1536",
  "quality": "high",
  "format": "jpeg",
  "contentType": "image/jpeg",
  "bytes": 312044,
  "prompt": "TARGET_CITY = \"Munich\" Full-bleed vertical 3:4 minimalist flat-vector travel art poster …",
  "key": "postcards/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b.jpg",
  "url": "https://postcards.mypreflight.io/postcards/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b.jpg",
  "handoff": {
    "mode": "inline",
    "reason": "https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/postcard-generator/invocations answered 429 TooManyRequestsException"
  }
}
```

Errors answer `{ "error": { "code", "message", "status" } }` with a matching status: `400` bad arguments, `401` a
missing or wrong bearer token, `404` any path but `/city`, `422` a
prompt OpenAI refused to draw, `429` OpenAI rate limiting, `502` OpenAI unreachable, unreadable or a bucket that
refused the upload, `500` missing configuration or anything else. A refused prompt and an outage are deliberately
different statuses — retrying the first will never help.

### Why the postcard is stored, not returned

Two limits decide the shape of this function.

**A Lambda response may not exceed [6 MB][docs-limits].** A `gpt-image-2` PNG poster at the default 3:4 size is several
megabytes before base64 adds a third on top, so the image cannot reliably travel in the response. It goes to S3
instead, and the result carries only the `key` and `url` it landed under.

**A Function URL call is synchronous.** The caller waits for the whole invocation, up to the function's five-minute
timeout, while the backend gives up after 30 seconds. A render at the default size and quality regularly takes longer
than that, so making the caller wait for one was never going to work.

**So the function does not make the caller wait.** It validates the arguments, hands the render to an asynchronous
invocation of itself and answers `202` at once with the `key` and `url` the art will appear under. Only a malformed
request is answered synchronously, as a `400`, because that is the one failure the caller can act on.

**The hand-off is the Lambda Invoke API.** The function invokes its own name with `X-Amz-Invocation-Type: Event`,
signed with SigV4 from the role's temporary credentials, and the role may invoke this function and nothing else. Lambda
queues the event and answers `202`. The queued invocation receives `{ "kind": "draw", "params": … }`, which only an
IAM-signed invoke can deliver, so it skips the bearer check and draws without handing off again. The event invoke
configuration allows no retries, so a render that fails is never paid for twice.

**How the render was handed off is in the answer.** Every answer from Lambda carries `handoff`: `{ "mode":
"invocation" }` on a `202`, and `{ "mode": "inline", "reason": "…" }` on a `200` when Lambda refused the invocation,
where the reason is the refusal. A caller that sees `inline` is looking at the one case that makes it wait, with the
explanation attached. The logs are in CloudWatch, under `/aws/lambda/postcard-generator`.

**Renders are never lost to a failed hand-off.** Off Lambda — the dev server, the test suite — there is no function to
invoke, so the function draws while the caller waits and answers without `handoff`. On Lambda, a refused invocation
falls back to the same, and the render finishes within the function's timeout even after the caller has given up.

**This is why the caller chooses the uuid.** The object location is known before the render starts, so a `202` costs
the caller nothing: it polls `<prefix><uuid>.<ext>` in the bucket until the object appears. A render that fails after
the hand-off is only visible as art that never appears, so a caller that polls needs a deadline of its own.

**The configured format is JPEG.** A `gpt-image-2` PNG poster at 3:4 is several megabytes; JPEG at
`POSTCARD_COMPRESSION` is a fraction of that for artwork this flat. `POSTCARD_FORMAT=png` is a supported setting, and
now that the bytes never pass through the result there is no ceiling on it beyond the bucket.

**WebP is not offered at all.** The model accepts `output_format: webp` and [answers with PNG bytes anyway][webp-bug],
so the field would lie about what came back. `POSTCARD_FORMAT=webp` is refused as a misconfiguration rather than
silently honoured.

### Where the postcards land

The upload is a plain signed `PUT` against the S3 API, so the function keeps its zero runtime dependencies —
`src/s3.ts` signs SigV4 with `node:crypto` rather than carrying an AWS SDK. It signs with the temporary credentials
Lambda gives the function's role (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`), which may put
objects under the prefix and nothing else.

| Variable             | Default                                          | Meaning                                            |
| -------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `S3_BUCKET`          | — (required)                                     | Bucket the postcards are stored in.                |
| `S3_REGION`          | `$AWS_REGION`                                    | Region, used for the endpoint and the SigV4 scope. |
| `S3_ENDPOINT`        | `https://$S3_BUCKET.s3.$S3_REGION.amazonaws.com` | Override, so the suite can stand a bucket in.      |
| `S3_PUBLIC_BASE_URL` | `$S3_ENDPOINT`                                   | Base url reported to readers. CloudFront in production. |
| `S3_PREFIX`          | `postcards/`                                     | Key prefix. Empty stores at the bucket root.       |

Objects are named `<prefix><uuid>.<ext>`, where the extension follows the format: `jpeg` is stored as `.jpg`, `png` as
`.png`. The uuid is lowercased and validated as a uuid and nothing else, so a caller cannot shape a key out of it.

The upload is signed against `S3_ENDPOINT` while the `url` in the answer is built from `S3_PUBLIC_BASE_URL`, which is
`https://postcards.mypreflight.io` in production. SigV4 signs the host, so the bucket endpoint is the one that has to be
signed; the CloudFront domain only ever serves reads. Left unset, the two are the same and readers are pointed at the
bucket directly.

The bucket is private and enforces bucket-owner ownership, so uploads carry no ACL. Readers get the art through
CloudFront at `postcards.mypreflight.io`, which reads the bucket through origin access control.

Missing any required variable answers `500 MISCONFIGURED` naming the variable, rather than failing as an opaque Lambda
error.

### The city is part of the prompt

The city name is interpolated straight into the prompt, so it is validated as a name and nothing else: Latin script
only, at most 64 characters, at most five words. `Frankfurt am Main`, `Rio de Janeiro` and `Stratford-upon-Avon` pass;
a sentence, a newline, a quote or a non-Latin script does not. Everything rejected is rejected before the request
reaches OpenAI, so a bad argument costs nothing.

## Build, test and deploy

This project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

```shell
npm version 2.1.0 --no-git-tag-version
```

`integrity` fails the build if the manifest and the lock file disagree, and the version it agrees on is the one the
release workflow tags.

This project has configured continuous integration and continuous deployment pipelines. It uses GitHub Actions to
automatically build, test and deploy the function to AWS Lambda. You can find the configuration in `.github/workflows`
directory.

The infrastructure is an OpenTofu stack in `infra/`: the function on `nodejs24.x` and `arm64` with its Function URL,
role and log group, the S3 bucket, and CloudFront with its certificate for `postcards.mypreflight.io`. `./zip.sh` builds
the bundle in Docker into `dist.zip`, which the stack deploys. Every pull request plans the stack through
`dflook/tofu-plan`, and a merge to `main` tags the version and applies it through `dflook/tofu-apply` in the
`production` environment.

The stack generates the function secret with `random_password` and publishes the Function URL at the SSM parameter
`/mypreflight/postcard-generator/url` and the secret at `/mypreflight/postcard-generator/secret`, where the backend's
stack reads them. The one secret it is given is `OPENAI_API_KEY`, stored on the `production` environment and written to
SSM as a write-only value, so it never lands in a plan.

Everything runs in Docker, in the `app` service:

```shell
docker compose exec app npm test
docker compose exec app npm run test:functional
docker compose exec app npm run typecheck
docker compose exec app npm run lint
docker compose exec app npm run bundle
```

The functional suite drives the real entry point against a mockserver standing in for OpenAI and the bucket, so the
retry, cache, validation and error-mapping behaviour is covered without an API key and without a bill.

## Contact

My name is Oskar, an experienced programmer, cybersecurity enthusiast, and conference speaker from Poland. Feel free to
contact me via the platforms below:

<div align="center">

[![LinkedIn][linkedin-badge]][linkedin-url]
[![GitHub][github-badge]][github-url]
[![Website][web-badge]][web-url]

</div>

## License

A public domain under the [Unlicense][license-url]. Do what you want with it. I am an experienced software engineer, but
I am not connected anyhow with the airline industry. This project is created for educational purposes only and should
not be used for real-world aviation operations. Generated artwork is subject to the OpenAI terms covering the key that
paid for it.

[linkedin-badge]: https://img.shields.io/badge/Oskar%20Barcz-0A66C2?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiI%2BPHBhdGggZD0iTTIwLjQ1IDIwLjQ1aC0zLjU1di01LjU3YzAtMS4zMy0uMDMtMy4wNC0xLjg1LTMuMDQtMS44NSAwLTIuMTQgMS40NS0yLjE0IDIuOTR2NS42N0g5LjM1VjloMy40MXYxLjU2aC4wNWMuNDgtLjkgMS42NC0xLjg1IDMuMzctMS44NSAzLjYgMCA0LjI3IDIuMzcgNC4yNyA1LjQ2djYuMjl6TTUuMzQgNy40M2MtMS4xNCAwLTIuMDYtLjkzLTIuMDYtMi4wNiAwLTEuMTQuOTItMi4wNiAyLjA2LTIuMDYgMS4xNCAwIDIuMDYuOTMgMi4wNiAyLjA2IDAgMS4xNC0uOTMgMi4wNi0yLjA2IDIuMDZ6bTEuNzggMTMuMDJIMy41NlY5aDMuNTZ2MTEuNDV6TTIyLjIzIDBIMS43N0MuNzkgMCAwIC43NyAwIDEuNzN2MjAuNTRDMCAyMy4yMy43OSAyNCAxLjc3IDI0aDIwLjQ1QzIzLjIgMjQgMjQgMjMuMjMgMjQgMjIuMjdWMS43M0MyNCAuNzcgMjMuMiAwIDIyLjIzIDB6Ii8%2BPC9zdmc%2B&logoColor=white
[linkedin-url]: https://www.linkedin.com/in/oskarbarcz
[github-badge]: https://img.shields.io/badge/@oskarbarcz-181717?style=for-the-badge&logo=github&logoColor=white
[github-url]: https://github.com/oskarbarcz
[web-badge]: https://img.shields.io/badge/barcz.me-4A5568?style=for-the-badge&logo=googlechrome&logoColor=white
[web-url]: https://barcz.me
[banner]: .github/image/banner.png
[homepage]: https://mypreflight.io
[openai-images]: https://platform.openai.com/docs/guides/image-generation
[repo-api]: https://github.com/oskarbarcz/flight-tracker-api
[repo-app]: https://github.com/oskarbarcz/flight-tracker-app
[repo-transponder]: https://github.com/oskarbarcz/flight-tracker-transponder-app
[repo-aerolopa]: https://github.com/mypreflight/aerolopa-provider
[ci-badge]: https://img.shields.io/github/actions/workflow/status/mypreflight/postcard-generator/integrity.yaml?branch=main&style=for-the-badge&label=integrity
[ci-url]: https://github.com/mypreflight/postcard-generator/actions/workflows/integrity.yaml
[release-badge]: https://img.shields.io/github/v/release/mypreflight/postcard-generator?style=for-the-badge
[release-url]: https://github.com/mypreflight/postcard-generator/releases/latest
[license-badge]: https://img.shields.io/github/license/mypreflight/postcard-generator?style=for-the-badge
[license-url]: https://unlicense.org
[node-shield]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org
[ts-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[ts-url]: https://www.typescriptlang.org
[openai-badge]: https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white
[openai-url]: https://platform.openai.com
[docker-badge]: https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white
[docker-url]: https://www.docker.com
[docs-limits]: https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
[webp-bug]: https://github.com/openai/openai-node/issues/1850
[biome-badge]: https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge&logo=biome&logoColor=white
[biome-url]: https://biomejs.dev
[cucumber-badge]: https://img.shields.io/badge/Cucumber-23D96C?style=for-the-badge&logo=cucumber&logoColor=white
[cucumber-url]: https://cucumber.io
