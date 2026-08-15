FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 aicore \
    && useradd --uid 1000 --gid aicore --shell /bin/bash --create-home aicore

WORKDIR /workspace

USER aicore

ENTRYPOINT ["/bin/bash"]
