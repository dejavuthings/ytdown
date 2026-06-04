FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN echo '/// <reference types="next" />\n/// <reference types="next/image-types/global" />' > next-env.d.ts && \
    npm run build

# Prebuilt bgutil POT provider (Node flavor). We copy its app + matching node
# binary so it runs with the exact runtime it was built against (avoids ABI
# mismatch with our node:20 base).
FROM brainicism/bgutil-ytdlp-pot-provider:latest AS potprovider

FROM node:20-slim

# Pin the bgutil plugin version to match the provider image we copy from.
ARG BGUTIL_VERSION=1.3.1

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates python3 ffmpeg curl unzip libatomic1 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rwx /usr/local/bin/yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --- bgutil POT provider: defeats YouTube "Sign in to confirm you're not a
#     bot" on datacenter IPs by generating Proof-of-Origin tokens locally. ---
# 1) POT provider HTTP server (listens on 127.0.0.1:4416) + its own node binary.
COPY --from=potprovider /app /opt/bgutil-provider
COPY --from=potprovider /usr/local/bin/node /usr/local/bin/node-bgutil
# 2) yt-dlp GetPOT plugin (http provider). Extracted so the layout is
#    <plugins>/bgutil/yt_dlp_plugins/extractor/*.py — verified to load.
RUN mkdir -p /home/node/.config/yt-dlp/plugins/bgutil && \
    curl -L "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_VERSION}/bgutil-ytdlp-pot-provider.zip" -o /tmp/bgutil.zip && \
    unzip -oq /tmp/bgutil.zip -d /home/node/.config/yt-dlp/plugins/bgutil && \
    rm /tmp/bgutil.zip && \
    chown -R node:node /home/node/.config

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN mkdir -p tmp && chown -R node:node /app

USER node

# HOME must be set so yt-dlp finds the plugin dir under ~/.config.
ENV HOME=/home/node
# Expose the installed bgutil plugin version at runtime (update-check uses it).
ENV BGUTIL_VERSION=${BGUTIL_VERSION}
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Supervise the POT provider in a shell loop: launch it and auto-restart on
# crash, independent of the Node app (Next bundles instrumentation separately,
# so app-side supervision isn't reliable). Then refresh yt-dlp and start the app.
CMD sh -c "(while true; do echo \"[pot] starting provider $(date -u)\" >> /tmp/pot-provider.log; node-bgutil /opt/bgutil-provider/build/main.js >> /tmp/pot-provider.log 2>&1; echo \"[pot] provider exited ($?), restarting in 3s\" >> /tmp/pot-provider.log; sleep 3; done &) && sleep 2 && (yt-dlp -U || true) && node server.js"
