FROM node:22-alpine AS build
ARG BUILD_COMMIT
WORKDIR /app
COPY . .
RUN echo "$BUILD_COMMIT" > /tmp/build-commit && npm install && npm run build

FROM nginx:1.27-alpine
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
