<div align="center">

# postcard-generator

The city artwork function of the [**MyPreflight**][homepage] platform. Draws a bespoke, flat-vector travel
poster for any city on demand, as a component of the platform's App Platform app.

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
- stores the poster in DigitalOcean Spaces under a uuid the caller chooses, and answers with where it landed,
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

No runtime dependencies at all — the function is the standard library plus compiled TypeScript, which keeps the
deployed artifact small and the cold start immediate.

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
   answers a tiny stand-in image without spending anything:

   ```shell
   curl "http://localhost:3001/?city=Munich&uuid=$(uuidgen | tr 'A-Z' 'a-z')"
   ```

   `SPACES_ENDPOINT` points at the same mock, so nothing is uploaded either. Point `OPENAI_API_HOST` at
   `https://api.openai.com` with a real `OPENAI_API_KEY`, and `SPACES_ENDPOINT` at the real bucket with a real
   `SPACES_KEY` and `SPACES_SECRET`, to draw and store for real.

### On-demand by design

This is a functions component of the `mypreflight` App Platform app — the same app the backend runs in, deployed from
this repository rather than as a separate serverless project. It scales to zero, costs nothing while nobody is asking
for a city, and starts on the first request, which fits a render the backend stores permanently and therefore asks for
once per destination.

```shell
curl -H "X-Require-Whisk-Auth: $SECRET" \
  "https://<app-host>/postcard-generator/postcard/city?city=Munich&uuid=$UUID"
```

Functions reach the network through the app's public ingress and cannot be placed on a private one — they support
neither VPCs nor App Platform internal routing. The endpoint is therefore guarded by a shared secret, declared as
`webSecure` in `project.yml`. That secret is doing more than hiding an implementation detail here: every unguarded call
would spend money at OpenAI.

The function is a self-contained package under `packages/postcard/city`, with its own `package.json`, build and
dependencies. `src/function.ts` is the entry point DigitalOcean calls, and `scripts/dev-server.ts` beside it wraps that
entry point in a throwaway HTTP server so `docker compose up` gives you something to curl; it is never deployed.

Its timeout is raised to five minutes and its memory to 512 MB in `project.yml`, because a high-quality render
regularly takes tens of seconds and occasionally minutes — far past the platform default.

### API documentation

The contract is `openapi.json` in the repository root — `GET /postcard/city`, requiring the
`X-Require-Whisk-Auth` header. It is the source of truth: `flight-tracker-api` generates its client types from it
rather than restating them.

The function takes arguments, not paths — as query parameters over HTTP, or as the `args` object when invoked through
the DigitalOcean API.

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
  "handoff": { "mode": "inline", "reason": "no platform credentials on board" }
}
```

Errors answer `{ "error": { "code", "message", "status" } }` with a matching status: `400` bad arguments, `422` a
prompt OpenAI refused to draw, `429` OpenAI rate limiting, `502` OpenAI unreachable, unreadable or a bucket that
refused the upload, `500` missing configuration or anything else. A refused prompt and an outage are deliberately
different statuses — retrying the first will never help.

### Why the postcard is stored, not returned

Two platform limits decide the shape of this function, and neither is negotiable.

**A function result may not exceed [1 MB][docs-limits].** A `gpt-image-2` poster at the default 3:4 size is larger than
that before base64 adds a third on top, so the image cannot travel in the response at all. It goes to Spaces instead,
and the result carries only the `key` and `url` it landed under.

**A synchronous web invocation is cut off after about 40 seconds.** The `timeout` raised to five minutes in
`project.yml` governs how long the function may *run*, not how long the caller may wait. A render at the default size
and quality regularly takes longer than 40 seconds, so waiting for one was never going to work.

**So the function does not make the caller wait.** It validates the arguments, hands the render to a second,
non-blocking activation of itself and answers `202` at once with the `key` and `url` the art will appear under. Only a
malformed request is answered synchronously, as a `400`, because that is the one failure the caller can act on.

**The hand-off has two routes, tried in order.** The first is the platform API: the `__OW_API_HOST`, `__OW_API_KEY`,
`__OW_NAMESPACE` and `__OW_ACTION_NAME` an OpenWhisk action is normally given, spent on a single authenticated `POST`
to `actions/<package>/<action>?blocking=false`. An App Platform functions component does not always get those
variables, and without them the first route is not even attempted.

The second route needs nothing from the platform: the function calls **its own public endpoint**, `POSTCARD_PUBLIC_URL`,
with the same shared secret the original caller used. A web invocation answers only when the render is finished, so
the connection is deliberately abandoned after two seconds — the activation it started runs on regardless, which is
the whole point of the 40-second cut-off being the caller's problem and not the render's. Either route reaches the
same code, told it is the background activation by a `background: true` argument the web caller never sets.

**Which route ran is in the answer, not in the logs.** App Platform functions components run in a namespace `doctl`
does not surface and whose activations are not retrievable, so `console.log` from inside a render is effectively write
-only. Every answer therefore carries `handoff`: `{ "mode": "activation" }` or `{ "mode": "web" }` on a `202`, and
`{ "mode": "inline", "reason": "…" }` on a `200`, where the reason says why each route refused. A caller that sees
`inline` is looking at the one case that makes it wait, with the explanation attached.

**Renders are never lost to a failed hand-off.** Off the platform — the dev server, the test suite — neither route is
configured, and if both refuse the function falls back to drawing while the caller waits, which is the old behaviour:
the platform cuts the caller off at 40 seconds and the render finishes anyway.

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

The upload is a plain signed `PUT` against the Spaces S3 API, so the function keeps its zero runtime dependencies —
`src/spaces.ts` signs SigV4 with `node:crypto` rather than carrying an AWS SDK.

| Variable          | Default                                             | Meaning                                        |
| ----------------- | --------------------------------------------------- | ---------------------------------------------- |
| `SPACES_BUCKET`   | — (required)                                        | Bucket the postcards are stored in.            |
| `SPACES_KEY`      | — (required)                                        | Spaces access key.                             |
| `SPACES_SECRET`   | — (required)                                        | Spaces secret key.                             |
| `SPACES_REGION`   | `fra1`                                              | Region, used for the endpoint and the SigV4 scope. |
| `SPACES_ENDPOINT` | `https://$SPACES_BUCKET.$SPACES_REGION.digitaloceanspaces.com` | Override, so the suite can stand a bucket in. |
| `SPACES_PUBLIC_BASE_URL` | `$SPACES_ENDPOINT`                           | Base url reported to readers. A CNAME in production. |
| `SPACES_PREFIX`   | `postcards/`                                        | Key prefix. Empty stores at the bucket root.   |
| `SPACES_ACL`      | `public-read`                                       | ACL every object is stored with.               |

Objects are named `<prefix><uuid>.<ext>`, where the extension follows the format: `jpeg` is stored as `.jpg`, `png` as
`.png`. The uuid is lowercased and validated as a uuid and nothing else, so a caller cannot shape a key out of it.

The upload is signed against `SPACES_ENDPOINT` while the `url` in the answer is built from
`SPACES_PUBLIC_BASE_URL`, which is `https://postcards.mypreflight.io` in production. SigV4 signs the host, so the
bucket endpoint is the one that has to be signed; the CNAME only ever serves reads. Left unset, the two are the same
and readers are pointed at the bucket directly.

`SPACES_ACL` is `public-read` because the platform shows the artwork to users straight from the bucket. Set it to
`private` if the backend should serve the bytes itself, and the `url` in the response then needs signing to be
readable.

Missing any required variable answers `500 MISCONFIGURED` naming the variable, rather than failing opaquely at the
platform level.

### The city is part of the prompt

The city name is interpolated straight into the prompt, so it is validated as a name and nothing else: Latin script
only, at most 64 characters, at most five words. `Frankfurt am Main`, `Rio de Janeiro` and `Stratford-upon-Avon` pass;
a sentence, a newline, a quote or a non-Latin script does not. Everything rejected is rejected before the request
reaches OpenAI, so a bad argument costs nothing.

## Build, test and deploy

This project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

```shell
npm version 1.2.0 --no-git-tag-version --prefix packages/postcard/city
```

`integrity` fails the build if the manifest and the lock file disagree, and the version it agrees on is the one the
release workflow tags.

This project has configured continuous integration and continuous deployment pipelines. It uses GitHub Actions to
automatically build, test and deploy the app to the DigitalOcean. You can find the configuration in `.github/workflows`
directory.

First deployment needs the component adding to the app spec, together with four secrets: `POSTCARD_FUNCTION_SECRET`,
`OPENAI_API_KEY`, `SPACES_KEY` and `SPACES_SECRET`. Everything else the function reads is set as a literal in
`project.yml` — only what appears in a package `environment:` block reaches the runtime, so a variable set on the
component and absent there has no effect.

`POSTCARD_PUBLIC_URL` is one of those literals and it is the function's own address, so it has to match where the app
routes this component: the ingress rule for `postcard-generator` on the app's default domain, plus `/postcard/city`.
Get it wrong and the second hand-off route refuses, which shows up as `handoff.mode: "inline"` in every answer rather
than as a broken deployment.

App Platform rebuilds the component whenever `main` moves, so the workflow here only tags the version and drafts the
GitHub release. There is no image and no registry: App Platform builds from this repository using `project.yml`.

Everything runs in Docker, in the `city` service:

```shell
docker compose exec city npm test
docker compose exec city npm run test:functional
docker compose exec city npm run typecheck
docker compose exec city npm run lint
docker compose exec city npm run build
```

The functional suite drives the real entry point against a mockserver standing in for OpenAI, so the retry, cache,
validation and error-mapping behaviour is covered without an API key and without a bill.

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
[docs-limits]: https://docs.digitalocean.com/products/functions/details/limits/
[webp-bug]: https://github.com/openai/openai-node/issues/1850
[biome-badge]: https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge&logo=biome&logoColor=white
[biome-url]: https://biomejs.dev
[cucumber-badge]: https://img.shields.io/badge/Cucumber-23D96C?style=for-the-badge&logo=cucumber&logoColor=white
[cucumber-url]: https://cucumber.io
