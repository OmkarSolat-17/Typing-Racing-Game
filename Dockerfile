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
# nginx writes to /var/cache/nginx, /var/run and /var/log/nginx; make them ours.
RUN adduser -D -H -u 10024 appuser \
    && mkdir -p /var/cache/nginx /var/run \
    && chown -R appuser:appuser /var/cache/nginx /var/run /var/log/nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Fail the *build*, not the deploy, if the server block is invalid (conf.d files live
# inside the http block; a main-context directive there is a hard nginx error).
RUN nginx -t

COPY --chown=appuser:appuser --from=build /app/dist /usr/share/nginx/html
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
# Only `daemon off;` belongs here. The stock /etc/nginx/nginx.conf already sets
# `pid /var/run/nginx.pid;`, and passing the same directive through `-g` is a fatal
# `"pid" directive is duplicate` emerg: the master exits at once and nothing answers.
# The chown of /var/run above is what lets a non-root master write that pid file.
CMD ["nginx", "-g", "daemon off;"]
