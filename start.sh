#!/bin/sh
set -e
cd server
if [ ! -d node_modules ]; then
  npm install
fi
PORT=5173 OPENAI_API_KEY="$(cat ~/.credentials_openai_wst)" npm start
