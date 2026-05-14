# Static HTTP server for workshop-sandbox (TLS is expected at a reverse proxy).
FROM nginx:1.27-alpine
COPY workshop-sandbox/ /usr/share/nginx/html/
EXPOSE 80
