# Gridline SLD

Gridline SLD is a browser-based single-line diagram editor built with React, TypeScript, and Vite.

## Run with Docker

Build the production image:

```sh
docker build -t gridline-sld:local .
```

Start it on port 8080:

```sh
docker run --rm -p 8080:8080 --name gridline-sld gridline-sld:local
```

Open <http://localhost:8080>. The container also exposes a health endpoint at `/healthz`.

## Publish the image

Log in to your container registry, then tag and push the image. Replace the example registry path and version with yours:

```sh
docker login ghcr.io
docker tag gridline-sld:local ghcr.io/YOUR_ORG/gridline-sld:v1.0.0
docker push ghcr.io/YOUR_ORG/gridline-sld:v1.0.0
```

## Local development

```sh
npm ci
npm run dev
```
