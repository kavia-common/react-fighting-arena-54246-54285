#!/bin/bash
cd /home/kavia/workspace/code-generation/react-fighting-arena-54246-54285/frontend_react_game
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

