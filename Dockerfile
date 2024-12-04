FROM node:22-bookworm-slim

RUN apt update \
 && apt install -y \
        fonts-morisawa-bizud-mincho fonts-morisawa-bizud-gothic \
        fonts-noto-cjk fonts-noto-core fonts-inconsolata fonts-mathjax \
        libxss1 chromium=131.* --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app
RUN mkdir mnt

COPY package.json package-lock.json .

RUN npm init -y \
 && npm install \
 && groupadd -r user && useradd -r -g user -G audio,video user \
 && mkdir -p /home/user/Downloads \
 && chown -R user:user /home/user \
 && chown -R user:user /opt/app

COPY LICENSE.txt README.md md2pdf.js .
COPY resource resource/
COPY doc-images doc-images/

USER user
