# Minimal image for the self-contained Code Trio CLI bundle.
# Build the bundle first with `npm ci && npm run build:cli`, then:
#   docker build -t code-trio .
#   docker run --rm -v "$PWD:/work" -w /work code-trio spell "src/**/*.ts"
FROM node:20-alpine

LABEL org.opencontainers.image.title="Code Trio CLI" \
      org.opencontainers.image.description="Offline compare, spell check, and beautify CLI." \
      org.opencontainers.image.source="https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck" \
      org.opencontainers.image.licenses="Apache-2.0"

# git enables `code-trio diff --ref <ref>`.
RUN apk add --no-cache git

WORKDIR /app
COPY apps/cli/dist/cli/index.cjs /app/code-trio.cjs
RUN printf '#!/bin/sh\nexec node /app/code-trio.cjs "$@"\n' > /usr/local/bin/code-trio \
    && chmod +x /usr/local/bin/code-trio

WORKDIR /work
ENTRYPOINT ["code-trio"]
CMD ["--help"]
