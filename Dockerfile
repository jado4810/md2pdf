FROM node:24-trixie-slim AS builder

WORKDIR /opt/app

COPY package.json package-lock.json .

ARG PUPPETEER_SKIP_DOWNLOAD=true

RUN npm init -y \
 && npm install

FROM node:24-trixie-slim

RUN apt-get update \
 && apt-get install -y \
            fonts-morisawa-bizud-mincho fonts-morisawa-bizud-gothic \
            fonts-noto-cjk fonts-noto-core fonts-inconsolata fonts-mathjax \
            libxss1 chromium-headless-shell --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app
RUN mkdir mnt

COPY --from=builder /opt/app/package.json /opt/app/package-lock.json .
COPY --from=builder /opt/app/node_modules node_modules/

COPY LICENSE.txt README.md md2pdf.js .
COPY resource resource/
COPY doc-images doc-images/

USER node
ENTRYPOINT ["node", "md2pdf.js"]
