FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV CONTROL_CENTER_HOST=0.0.0.0
ENV CONTROL_CENTER_PORT=8790

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN set -eux; \
  SS_DIR=""; \
  if [ -f tools/streamscribe/requirements.txt ]; then SS_DIR="tools/streamscribe"; fi; \
  if [ -f tools/StreamScribe/requirements.txt ]; then SS_DIR="tools/StreamScribe"; fi; \
  if [ -n "$SS_DIR" ]; then \
    python3 -m venv "$SS_DIR/.venv"; \
    "$SS_DIR/.venv/bin/python" -m pip install --upgrade pip; \
    "$SS_DIR/.venv/bin/python" -m pip install -r "$SS_DIR/requirements.txt"; \
  fi

EXPOSE 8790
CMD ["npm", "start"]
