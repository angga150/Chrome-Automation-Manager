Dashboard scaffold (minimal)

Run locally for development:

1. cd dashboard
2. npm install
3. npm start

It expects the backend API at the same host/port for simplicity (CORS not configured).
Set `DASHBOARD_TOKEN` in env if backend requires auth and pass `x-dashboard-token` header from the UI.
