# AIChainHelper

[![Build](https://img.shields.io/github/actions/workflow/status/your/repo/ci.yml?branch=main)](https://github.com/your/repo/actions)
[![License](https://img.shields.io/github/license/your/repo)](LICENSE)

Monorepo containing an Electron GUI and a CLI agent.

## Packages

- **apps/gui** - Electron app built with React, Vite and TypeScript
- **packages/agent** - TypeScript agent library and CLI

## Scripts

- `pnpm dev` - start GUI and agent in development mode
- `pnpm build` - type-check and build the GUI for macOS, Windows and Linux
- `pnpm build:cli` - build the agent CLI only
