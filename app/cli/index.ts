#!/usr/bin/env node

import { runCli } from './cli.js';

runCli().catch((err) => {
	// Top-level error handler to surface runtime exceptions in the CLI
	// Print stack and exit with non-zero code for easier debugging
	// eslint-disable-next-line no-console
	console.error('CLI error:', err && (err.stack || err.message) || err);
	process.exitCode = 1;
});
