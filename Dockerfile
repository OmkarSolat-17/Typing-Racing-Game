# KEYRUSH — static SPA image.
#
#   docker build -t keyrush .
#   docker run --rm -p 8080:8080 keyrush     # then open http://localhost:8080
#
# Multi-stage: the toolchain never reaches the runtime layer.

FROM node:22-alpine AS build
WORKDIR /app
ENV npm_config_update_notifier=false
# Lockfile first, so a source-only change reuses the `npm ci` layer.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# `npm run build` typechecks before bundling: a broken type graph cannot ship.
RUN npm run build


FROM nginx:1.29-alpine AS runtime
# The image owns its main config (nginx.main.conf) exactly so it never has to do the two
# things the distro config asks of a root master: `user nginx;` (setuid) and a pid file at
# /var/run/nginx.pid. That pair is how an unprivileged nginx container ends up printing four
# friendly [notice] lines and exiting 1 — which reads as "an empty port" from the outside.
# Temp paths and the request-body cache live under /var/cache/nginx, so that tree is ours.
RUN adduser -D -H -u 10024 appuser \
    && mkdir -p /var/cache/nginx /tmp \
    && chown -R appuser:appuser /var/cache/nginx
COPY nginx.main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Fail the *build*, not the deploy: a malformed server block is otherwise a dead container.
RUN nginx -t

COPY --chown=appuser:appuser --from=build /app/dist /usr/share/nginx/html
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
# `-g` carries only `daemon off;`. Anything the main config already declares (pid, error_log,
# worker_processes) must not be repeated here — a duplicate main-context directive is a fatal
# [emerg], not a warning.
CMD ["nginx", "-g", "daemon off;"]
