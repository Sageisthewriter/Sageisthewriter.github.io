# Sage contact API — Cloudflare Worker

Keep this folder at **`contact-worker/` inside the same repository as the website**. GitHub Pages publishes the root `index.html`; Cloudflare Workers Builds uses `contact-worker` as its root directory. This Worker receives form submissions and forwards confirmed messages to Discord. Visitors stay on the GitHub Pages website.

Setup below uses only GitHub and Cloudflare's web dashboards. **No local CLI, database, or owned domain is required.** Cloudflare's build service runs the deployment command on your behalf and creates the native rate-limit bindings from `wrangler.jsonc`. Pasting JavaScript alone does not create these bindings, so deploy this repository through Workers Builds.

Turnstile is optional and **off by default**. No Cloudflare resources have been created or messages sent by the coding agent.

## 1. Create the Discord webhook

1. In Discord, choose a server and a regular text channel, such as `#portfolio-inquiries`.
2. Open **Server Settings → Integrations → Webhooks → New Webhook**. You need the Manage Webhooks permission.
3. Name it **Sage Portfolio**, select the channel, and save.
4. Copy the **Webhook URL**. Keep it private; it belongs in a Worker **Secret**, never in GitHub or website config.

[Discord's webhook guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks). Configure the channel's Discord notification preferences if phone/desktop alerts are wanted. Visitor input cannot trigger user, role, or everyone mentions.

## 2. Connect this repository to a Worker

1. In **Cloudflare → Workers & Pages → Create application**, choose the **Worker GitHub/import repository** flow, rather than Pages or Hello World.
2. Authorize GitHub and select the **same repository that contains the website**.
3. Select the production branch, normally `main`.
4. Use **`sage-contact`** as the Worker/project name. For another name, first change `name` in this repository's `wrangler.jsonc` to match. The Pages project has its own independent name.
5. Set **Root directory** to **`contact-worker`**. Cloudflare must use the `package.json`, `src/`, and `wrangler.jsonc` inside this subdirectory, not the website package at the repository root.
6. Leave **Build command** blank; no compilation is needed.
7. Set **Deploy command** to **`npm run deploy`**. Enter this in the dashboard field; you do not run it on your computer. Cloudflare installs the repository's dependency and runs its deployment script.
8. Keep the automatically generated deployment API token unless your account requires a custom one. Do not create a GitHub Actions workflow or put a Cloudflare token in GitHub for this setup.
9. Deploy. If asked to select an account `workers.dev` subdomain, choose one.
10. Keep non-production branch builds disabled for this contact service unless intentionally creating an isolated preview setup.

Cloudflare reads `wrangler.jsonc`, deploys `src/index.js`, and provisions all four native rate-limit bindings. They do not require manually creating a resource. `/health` returns 503 until the runtime settings below are added; this does not mean the code deployment failed.

Official reference: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 3. Add runtime settings

Open the deployed **Worker → Settings → Variables and Secrets**. These are **runtime** values; build variables/secrets on the Git connection screen are not available to the running contact handler.

| Type | Name | Value |
| --- | --- | --- |
| **Secret** | `DISCORD_WEBHOOK_URL` | Complete webhook URL copied from Discord |
| **Text** | `ALLOWED_ORIGINS` | Actual production Pages origin, e.g. `https://USERNAME.github.io` |
| **Text** | `REQUIRE_TURNSTILE` | `false` |

Enter values without surrounding quotes and save/deploy the settings. `REQUIRE_TURNSTILE` also defaults to false when omitted. No Turnstile secret is needed while it is disabled.

Origins must include `https://`, with **no trailing slash or path**. Replace the example with the actual GitHub Pages origin. Do not include a repository path: for `https://alice.github.io/sage/`, use `https://alice.github.io`. Multiple exact origins may be comma-separated:

```text
https://USERNAME.github.io,http://localhost:4173,http://127.0.0.1:4173
```

Local origins are optional. Do not use `*`. Branch preview origins must be explicitly added if needed. The Worker's own origin is not the portfolio origin. Origin checking limits browser callers; clients outside a browser can forge that header, so native throttling and optional Turnstile provide additional protection.

The configuration sets `keep_vars: true` so later GitHub deployments preserve dashboard text variables. Secrets are kept in Cloudflare, never in the repository. Keep that option when editing configuration. [Wrangler's configuration precedence](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth).

## 4. Connect the portfolio

1. Copy the Worker's actual public address from its overview, for example `https://sage-contact.YOUR-SUBDOMAIN.workers.dev`.
2. Open that address with **`/health`** appended. With correct runtime configuration it returns:

   ```json
   { "ok": true, "service": "sage-contact", "turnstileRequired": false }
   ```

   This checks configuration and binding availability without consuming rate-limit slots or sending a message. It does not validate that the webhook can deliver to Discord.
3. In this repository, edit **`config.js` at the root**:

   ```js
   window.SAGE_CONFIG = {
     contactEndpoint: 'https://sage-contact.YOUR-SUBDOMAIN.workers.dev/contact',
     turnstileSiteKey: '',
   };
   ```

4. Replace the example with the actual Worker address, ending in `/contact`, then commit/push the **same repository**. GitHub Pages deploys the updated config automatically.
5. Open the production GitHub Pages site, send one form message, and confirm both Discord receipt and website success. Testing is left to the project owner.

The Worker uses Discord's `wait=true` response and requires a created message ID before reporting success. A timeout can leave delivery uncertain: check Discord before submitting again. No automatic retries or email acknowledgments are sent.

## Optional: enable Turnstile

1. In **Cloudflare → Turnstile → Add widget**, choose **Managed** and add the actual **GitHub Pages hostname**, e.g. `USERNAME.github.io`. No scheme, port, or path. Add local/other website hostnames only when needed.
2. Copy the widget's public **site key** and private **secret key**.
3. In the Worker's **runtime Variables and Secrets**, add **Secret** `TURNSTILE_SECRET_KEY` and **Text** `TURNSTILE_HOSTNAMES`, containing the exact allowed form hostnames, comma-separated.
4. In the repository root, set `turnstileSiteKey` in `config.js` to the public site key. Commit/push and wait for GitHub Pages to deploy it.
5. Set the Worker's runtime `REQUIRE_TURNSTILE` to **`true`** and deploy that settings change.
6. `/health` now reports `turnstileRequired: true`. Confirm form submission through the actual GitHub Pages site.

The Worker verifies token success, action `contact`, and hostname using [Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). To disable, set `REQUIRE_TURNSTILE=false` in the Worker, then clear the public site key in the repository root and push. Rate limits stay active in either mode.

## Native rate limiting

Edit limits in **`contact-worker/wrangler.jsonc`**, then commit/push. The backend expects these exact binding names:

| Binding | Default per 60 seconds | Key / timing |
| --- | --- | --- |
| `ATTEMPT_LIMITER` | 12 | Per IP, before parsing an allowed-origin POST |
| `SENDER_LIMITER` | 3 | Per IP, after field validation |
| `EMAIL_LIMITER` | 2 | Per normalized email, after optional verification |
| `DELIVERY_LIMITER` | 20 | Shared delivery key, before calling Discord |

Cloudflare's native limits are **approximate and per Cloudflare location**. The delivery limit is not a strict worldwide cap; requests can exceed thresholds while counters synchronize. This is not a guaranteed rolling-IP window. People sharing an IP share its allowance. The Worker returns 429 with a conservative `Retry-After: 60` when a binding denies a request, and fails closed if the limiter is unavailable. Accepted attempts consume capacity even if later verification or delivery fails. Discord throttling is also returned as 429.

Keys sent to the bindings are SHA-256 hashes. No message database or custom counter cleanup is used. Keep the four `namespace_id` values unique within the account unless deliberately sharing counters. The supplied IDs are positive integer strings; change them before deployment if another application already uses them. Native rate-limit bindings are not currently visible in the dashboard; `/health` checks their presence in the runtime. [Cloudflare rate-limiting documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Ongoing updates and troubleshooting

Push changes to the shared repository: GitHub Pages publishes the root website and Workers Builds deploys the contact-worker subdirectory. Update the Worker's allowed origin and optional Turnstile hostnames if the GitHub Pages hostname changes. A repository-name change alters the website path, not its origin. Keep webhook rotations in Worker runtime secrets.

| Symptom | Check |
| --- | --- |
| Worker build fails | Correct repository, `contact-worker` root directory, `npm run deploy`, matching Worker name, successful dependency installation |
| `/health` returns 503 | Runtime webhook Secret, exact allowed origin, all four native bindings provisioned from the config; redeploy from GitHub if bindings are missing |
| CORS/network error | Exact GitHub Pages origin in `ALLOWED_ORIGINS`, correct public Worker endpoint, settings deployed |
| Form says preview only | Set `contactEndpoint` in the repository root and push |
| 403 verification error | Matching keys and actual GitHub Pages hostname in both widget and Worker settings |
| 429 | Wait for the displayed cooldown; check Discord too if its upstream limit was reached |
| 502 / unconfirmed delivery | Check Discord before retrying, then check the webhook still exists and targets a regular text channel |

Use Worker live logs in the dashboard for generic event/request references. Application logs omit webhook URLs, form content, and credentials. Do not test through the embedded Worker editor preview; use the actual GitHub Pages form so the origin matches.
