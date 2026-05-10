#!/usr/bin/env bun
// Tiny shim — npm's `bin` field doesn't accept .ts files, so this .mjs
// shim is the published entry point. Bun is required (per package.json
// `engines.bun`) and resolves the .ts import directly.
import './src/bin.ts'
