FROM node:24-trixie-slim AS builder

RUN apt update \
 && apt install -y python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app

COPY package.json package-lock.json .

RUN npm init -y \
 && npm install \
 && rm -rf node_modules/cld/deps/cld

FROM node:24-trixie-slim

RUN apt update \
 && apt install -y \
        fonts-morisawa-bizud-mincho fonts-morisawa-bizud-gothic \
        fonts-noto-cjk fonts-noto-core fonts-inconsolata fonts-mathjax \
        libxss1 chromium --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app
RUN mkdir mnt

COPY --from=builder /opt/app/package.json /opt/app/package-lock.json .
COPY --from=builder /opt/app/node_modules node_modules/

RUN groupadd -r user && useradd -r -g user -G audio,video user \
 && mkdir -p /home/user/Downloads \
 && chown -R user:user /home/user \
 && chown -R user:user /opt/app

COPY LICENSE.txt README.md md2pdf.js .
COPY resource resource/
COPY doc-images doc-images/

USER user
ENTRYPOINT ["node", "md2pdf.js"]
