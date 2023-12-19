FROM node:lts-slim

RUN apt update \
 && apt install -y fonts-morisawa-bizud-mincho fonts-morisawa-bizud-gothic \
                   fonts-noto-cjk fonts-noto-core fonts-inconsolata \
                   libxss1 chromium --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app
RUN mkdir mnt

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json package-lock.json .

RUN npm init -y \
 && npm install \
 && groupadd -r user && useradd -r -g user -G audio,video user \
 && mkdir -p /home/user/Downloads \
 && chown -R user:user /home/user \
 && chown -R user:user /opt/app

COPY LICENSE.txt md2pdf.js article.css .

USER user
