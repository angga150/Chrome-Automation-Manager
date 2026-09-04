import React, { useEffect, useMemo, useState } from 'react'

const API_BASE = 'http://127.0.0.1:3015'

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-dashboard-token': ''
})

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function getSessionState(session) {
  if (session.pid) return 'Running'
  return 'Stopped'
}

export default function App() {
  const [sessions, setSessions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [status, setStatus] = useState('Loading...')
  const [error, setError] = useState('')
  const [bulkUrl, setBulkUrl] = useState('https://www.tiktok.com/@example/video/1234567890123456789')
  const [bulkMessage, setBulkMessage] = useState('')

  const selectedSession = useMemo(() => {
    return sessions.find((session) => session.sessionId === selectedSessionId) || sessions[0] || null
  }, [sessions, selectedSessionId])

  async function loadDashboard() {
    try {
      setStatus('Connecting...')
      const [sessionsResponse, metricsResponse, accountsResponse] = await Promise.all([
        fetch(`${API_BASE}/sessions`, { headers: getHeaders() }),
        fetch(`${API_BASE}/metrics`, { headers: getHeaders() }),
        fetch(`${API_BASE}/accounts`, { headers: getHeaders() })
      ])

      if (!sessionsResponse.ok || !metricsResponse.ok || !accountsResponse.ok) {
        throw new Error('API returned an error response')
      }

      const sessionsData = await sessionsResponse.json()
      const metricsData = await metricsResponse.json()
      const accountsData = await accountsResponse.json()
      const nextSessions = sessionsData.sessions || []
      const nextAccounts = accountsData.accounts || []

      setSessions(nextSessions)
      setAccounts(nextAccounts)
      setMetrics(metricsData.metrics || null)
      setSelectedSessionId((current) => current || nextSessions[0]?.sessionId || null)
      setStatus('Connected')
      setError('')
    } catch (loadError) {
      setStatus('Offline')
      setError(loadError.message || 'Unable to reach the dashboard API.')
    }
  }

  async function startSession(sessionId) {
    try {
      const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ port: 9222 + Math.floor(Math.random() * 200) })
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.reason || 'Session could not be started')
      }
      await loadDashboard()
    } catch (startError) {
      setError(startError.message || 'Start request failed')
    }
  }

  async function stopSession(sessionId) {
    try {
      const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/stop`, {
        method: 'POST',
        headers: getHeaders()
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.reason || 'Session could not be stopped')
      }
      await loadDashboard()
    } catch (stopError) {
      setError(stopError.message || 'Stop request failed')
    }
  }

  async function enqueueBulkLike() {
    if (!bulkUrl.trim()) {
      setBulkMessage('Please enter a TikTok video URL.')
      return
    }

    try {
      const targetAccounts = accounts.length > 0 ? accounts.map((account) => account.accountId) : sessions.map((session) => session.sessionId)
      const response = await fetch(`${API_BASE}/jobs/bulk`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'like',
          videoUrl: bulkUrl,
          accountIds: targetAccounts
        })
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.reason || 'Bulk like job could not be queued')
      }
      setBulkMessage(`Queued ${payload.jobs?.length ?? 0} like jobs for ${targetAccounts.length} account(s).`)
      setError('')
      await loadDashboard()
    } catch (bulkError) {
      setBulkMessage(bulkError.message || 'Bulk queue failed')
      setError(bulkError.message || 'Bulk queue failed')
    }
  }

  useEffect(() => {
    void loadDashboard()
    const interval = setInterval(() => {
      void loadDashboard()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Phase 5</p>
          <h1>Chrome Automation</h1>
        </div>
        <div className="topbar-actions">
          <div className={`status-pill ${status === 'Connected' ? 'online' : 'offline'}`}>
            {status}
          </div>
          <button className="primary-button" onClick={() => void loadDashboard()}>Refresh</button>
        </div>
      </header>

      {error && <div className="alert-box">{error}</div>}

      <section className="stats-grid">
        <article className="stat-card stat-card-primary">
          <span>Total Sessions</span>
          <strong>{sessions.length}</strong>
          <small>Registered browser sessions</small>
        </article>
        <article className="stat-card">
          <span>Running</span>
          <strong>{sessions.filter((session) => session.pid).length}</strong>
          <small>Active Chrome processes</small>
        </article>
        <article className="stat-card">
          <span>Session Count</span>
          <strong>{metrics?.session_count ?? 0}</strong>
          <small>Tracked by core</small>
        </article>
        <article className="stat-card">
          <span>Running Sessions</span>
          <strong>{metrics?.running_sessions ?? 0}</strong>
          <small>Lifecycle health</small>
        </article>
        <article className="stat-card">
          <span>Accounts</span>
          <strong>{accounts.length}</strong>
          <small>Tracked TikTok accounts</small>
        </article>
      </section>

      <main className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Orchestration</p>
              <h2>Session Manager</h2>
            </div>
            <button className="ghost-button" onClick={() => startSession('demo-dashboard')}>New demo session</button>
          </div>

          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="empty-state">No sessions available yet.</div>
            ) : (
              sessions.map((session) => (
                <article
                  key={session.sessionId}
                  className={`session-card ${selectedSession?.sessionId === session.sessionId ? 'selected' : ''}`}
                  onClick={() => setSelectedSessionId(session.sessionId)}
                >
                  <div className="session-card-head">
                    <div>
                      <h3>{session.sessionId}</h3>
                      <p>{session.profilePath || 'Profile not available'}</p>
                    </div>
                    <span className={`badge ${session.pid ? 'running' : 'stopped'}`}>
                      {getSessionState(session)}
                    </span>
                  </div>

                  <dl className="session-meta">
                    <div>
                      <dt>PID</dt>
                      <dd>{session.pid ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Profile</dt>
                      <dd>{session.profilePath ? 'Isolated' : 'Unknown'}</dd>
                    </div>
                    <div>
                      <dt>Started</dt>
                      <dd>{formatTimestamp(session.meta?.startedAt)}</dd>
                    </div>
                  </dl>

                  <div className="session-actions">
                    {session.pid ? (
                      <button className="secondary-button" onClick={(event) => { event.stopPropagation(); void stopSession(session.sessionId) }}>
                        Stop
                      </button>
                    ) : (
                      <button className="primary-button" onClick={(event) => { event.stopPropagation(); void startSession(session.sessionId) }}>
                        Start
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="panel detail-panel">
          <div className="panel-header detail-header">
            <div>
              <p className="section-kicker">Detail</p>
              <h2>Session Detail</h2>
            </div>
          </div>

          {selectedSession ? (
            <>
              <div className="detail-header-box">
                <h3>{selectedSession.sessionId}</h3>
                <span className={`badge ${selectedSession.pid ? 'running' : 'stopped'}`}>
                  {getSessionState(selectedSession)}
                </span>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>PID</dt>
                  <dd>{selectedSession.pid ?? '—'}</dd>
                </div>
                <div>
                  <dt>Profile path</dt>
                  <dd>{selectedSession.profilePath || '—'}</dd>
                </div>
                <div>
                  <dt>Start time</dt>
                  <dd>{formatTimestamp(selectedSession.meta?.startedAt)}</dd>
                </div>
                <div>
                  <dt>Chrome state</dt>
                  <dd>{selectedSession.pid ? 'Ready' : 'Stopped'}</dd>
                </div>
                <div>
                  <dt>CDP</dt>
                  <dd>{selectedSession.pid ? 'Connected' : 'Not initialized'}</dd>
                </div>
                <div>
                  <dt>Agent</dt>
                  <dd>{selectedSession.meta?.dryRun ? 'Dry run mode' : 'Extension ready'}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="empty-state">Select a session to inspect it.</div>
          )}

          <div className="panel-header detail-header" style={{ marginTop: 18 }}>
            <div>
              <p className="section-kicker">Bulk Action</p>
              <h2>Like a TikTok video</h2>
            </div>
          </div>

          <div className="bulk-form" style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            <input
              value={bulkUrl}
              onChange={(event) => setBulkUrl(event.target.value)}
              placeholder="https://www.tiktok.com/@user/video/1234567890123456789"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: '#0f1e2c', color: '#e5eefb' }}
            />
            <button className="primary-button" onClick={() => void enqueueBulkLike()}>Queue like for all accounts</button>
            {bulkMessage && <div className="empty-state" style={{ margin: 0 }}>{bulkMessage}</div>}
          </div>

          <div className="panel-header detail-header" style={{ marginTop: 18 }}>
            <div>
              <p className="section-kicker">Account Queue</p>
              <h2>TikTok Accounts</h2>
            </div>
          </div>

          <div className="session-list">
            {accounts.length === 0 ? (
              <div className="empty-state">No TikTok accounts tracked yet.</div>
            ) : (
              accounts.map((account) => (
                <article key={account.accountId} className="session-card selected" style={{ cursor: 'default' }}>
                  <div className="session-card-head">
                    <div>
                      <h3>{account.accountId}</h3>
                      <p>{account.lastError || 'No recent error'}</p>
                    </div>
                    <span className={`badge ${account.status === 'running' ? 'running' : 'stopped'}`}>
                      {account.status || 'idle'}
                    </span>
                  </div>
                  <dl className="session-meta">
                    <div>
                      <dt>Queue</dt>
                      <dd>{account.queue?.length ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatTimestamp(account.updatedAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}
