import React, { useEffect, useState } from 'react'

export default function App(){
  const [sessions, setSessions] = useState([])
  const [metrics, setMetrics] = useState(null)

  useEffect(()=>{
    fetch('/sessions', { headers: { 'x-dashboard-token': '' } }).then(r=>r.json()).then(d=>setSessions(d.sessions||[])).catch(()=>{})
    fetch('/metrics', { headers: { 'x-dashboard-token': '' } }).then(r=>r.json()).then(d=>setMetrics(d.metrics||null)).catch(()=>{})
  }, [])

  return (<div style={{padding:20,fontFamily:'sans-serif'}}>
    <h1>Chrome Automation Dashboard (MVP)</h1>
    <h3>Metrics</h3>
    <pre>{JSON.stringify(metrics,null,2)}</pre>
    <h3>Sessions</h3>
    <ul>
      {sessions.map(s=> <li key={s.sessionId}>{s.sessionId} — pid:{String(s.pid)}</li>)}
    </ul>
  </div>)
}
