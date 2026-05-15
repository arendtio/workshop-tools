#!/bin/sh
set -e
cd server
OPENAI_API_KEY="$(cat ~/.credentials_openai_wst)" npm start
