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
   curl "http://localhost:3001/?city=Munich"
   ```

   Point `OPENAI_API_HOST` at `https://api.openai.com` and set a real `OPENAI_API_KEY` to draw for real.

### On-demand by design

This is a functions component of the `mypreflight` App Platform app — the same app the backend runs in, deployed from
this repository rather than as a separate serverless project. It scales to zero, costs nothing while nobody is asking
for a city, and starts on the first request, which fits a render the backend stores permanently and therefore asks for
once per destination.

```shell
curl -H "X-Require-Whisk-Auth: $SECRET" \
  "https://<app-host>/postcard/postcard/city?city=Munich"
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

| Argument  | Default              | Meaning                                                                        |
| --------- | -------------------- | ------------------------------------------------------------------------------ |
| `city`    | — (required)         | The city to draw.                                                              |
| `size`    | `POSTCARD_SIZE`      | `WIDTHxHEIGHT`, both sides divisible by 16, within a 1:3 to 3:1 aspect ratio.   |
| `quality` | `POSTCARD_QUALITY`   | `auto`, `low`, `medium` or `high`.                                             |
| `format`  | `POSTCARD_FORMAT`    | `jpeg` or `png`.                                                               |

It answers with the artwork and everything it was drawn from, so a caller can reproduce or attribute the render later:

```json
{
  "city": "Munich",
  "model": "gpt-image-2",
  "size": "1152x1536",
  "quality": "high",
  "format": "jpeg",
  "contentType": "image/jpeg",
  "bytes": 312044,
  "prompt": "TARGET_CITY = \"Munich\" Full-bleed vertical 3:4 minimalist flat-vector travel art poster …",
  "image": "/9j/4AAQSkZJRgABAQEAYABgAAD…"
}
```

Errors answer `{ "error": { "code", "message", "status" } }` with a matching status: `400` bad arguments, `422` a
prompt OpenAI refused to draw, `429` OpenAI rate limiting, `502` OpenAI unreachable, unreadable or a postcard too large
to return, `500` anything else. A refused prompt and an outage are deliberately different statuses — retrying the first
will never help.

### The one megabyte ceiling

A DigitalOcean function may not return more than [1 MB of result][docs-limits], and base64 adds a third on top of the
bytes it encodes. That single number decides three things about this service.

**The image comes back encoded inside JSON, not as raw bytes.** The runtime can serve an image directly — set
`Content-Type` and return a base64 body — but the caller here is the backend, which wants the prompt and the render
settings alongside the artwork and stores the picture rather than displaying it. One JSON body carries both, and costs
nothing extra against the ceiling that already applies either way.

**The default format is JPEG.** A `gpt-image-2` PNG poster at 3:4 exceeds the ceiling every time. JPEG at
`POSTCARD_COMPRESSION` fits comfortably, and the flat-vector brief survives it. `format=png` is still accepted for
callers who ask for a small `size`.

**WebP is not offered at all.** The model accepts `output_format: webp` and [answers with PNG bytes anyway][webp-bug],
so the field would lie about what came back. `format=webp` is rejected with a `400` rather than silently honoured.

If a render slips past the ceiling regardless, the function answers `502 POSTCARD_TOO_LARGE` naming the actual size,
rather than letting the platform truncate the body into an image that will not decode.

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

First deployment needs the component adding to the app spec, together with a shared secret and an OpenAI key — the
fragment to merge is `.do/app.component.yaml`.

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
