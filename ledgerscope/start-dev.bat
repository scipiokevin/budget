@echo off
cd /d "C:\Users\KevDev\Documents\Playground 8\ledgerscope"
set PATH=%PATH%;C:\Program Files\nodejs
npm run dev > .dev-server.log 2>&1
