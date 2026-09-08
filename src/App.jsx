import { useState, useEffect, useRef } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

export default function App() {
  const [user, setUser] = useState(null)
  const [logins, setLogins] = useState([])
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hey there! How can I help you today?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatBottomRef = useRef(null)
  const loggedRef = useRef(false)

  const fetchLogins = async () => {
    try {
      const { data, error } = await supabase
        .from('user_logins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Fetch logins error:', error.message)
        return
      }

      if (data) {
        setLogins(data)
      }
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }

  const logSession = async (uid) => {
    try {
      const { error } = await supabase
        .from('user_logins')
        .insert([{ user_id: uid }])

      if (error) {
        console.error('Insert login error (check RLS policy):', error.message)
        return
      }

      await fetchLogins()
    } catch (err) {
      console.error('Log session error:', err)
    }
  }

  useEffect(() => {
    // 1. Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const activeUser = session?.user ?? null
      setUser(activeUser)
      if (activeUser) {
        fetchLogins()
        if (!loggedRef.current) {
          loggedRef.current = true
          logSession(activeUser.id)
        }
      }
    })

    // 2. Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const current = session?.user ?? null
        setUser(current)

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && current) {
          if (!loggedRef.current) {
            loggedRef.current = true
            await logSession(current.id)
          } else {
            await fetchLogins()
          }
        } else if (event === 'SIGNED_OUT') {
          loggedRef.current = false
          setLogins([])
          setMessages([{ role: 'assistant', text: 'Hey there! How can I help you today?' }])
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userText = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: userText }])
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('gemini-chat', {
        body: { message: userText }
      })

      if (error) throw error

      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No response received from Gemini.'

      setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
    } catch (err) {
      console.error('Chat error:', err)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong while connecting to the assistant.' }
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <main style={styles.authWrapper}>
        <div style={styles.card}>
          <h1 style={{ marginBottom: '8px' }}>Assessment Dashboard</h1>
          <p style={{ color: '#888', marginBottom: '24px' }}>Sign in to access features</p>
          <button style={styles.primaryBtn} onClick={handleSignIn}>
            Sign in with Google
          </button>
        </div>
      </main>
    )
  }

  return (
    <div style={styles.dashboard}>
      <header style={styles.nav}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Dashboard</h2>
          <small style={{ color: '#aaa' }}>{user.email}</small>
        </div>
        <button style={styles.secondaryBtn} onClick={handleSignOut}>
          Sign Out
        </button>
      </header>

      <div style={styles.grid}>
        {/* Left Side: Recent Logins Table */}
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Recent Logins (Last 10)</h3>
          <div style={styles.tableBox}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>User ID</th>
                  <th style={styles.th}>Time</th>
                </tr>
              </thead>
              <tbody>
                {logins.length === 0 ? (
                  <tr>
                    <td colSpan="2" style={{ ...styles.td, textAlign: 'center', color: '#777' }}>
                      No logins recorded yet
                    </td>
                  </tr>
                ) : (
                  logins.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.td}>
                        {row.user_id ? `${row.user_id.slice(0, 8)}...` : 'Unknown'}
                      </td>
                      <td style={styles.td}>
                        {new Date(row.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Gemini Chat Interface */}
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Gemini Assistant</h3>
          
          <div style={styles.chatWindow}>
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.bubble,
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  background: m.role === 'user' ? '#2563eb' : '#27272a'
                }}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div style={{ ...styles.bubble, alignSelf: 'flex-start', background: '#27272a', fontStyle: 'italic' }}>
                Typing...
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          <form onSubmit={handleSendMessage} style={styles.inputBar}>
            <input
              type="text"
              value={input}
              placeholder="Ask anything..."
              onChange={(e) => setInput(e.target.value)}
              style={styles.chatInput}
            />
            <button type="submit" disabled={loading} style={styles.sendBtn}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const styles = {
  authWrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dashboard: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '24px'
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #333'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.3fr',
    gap: '20px'
  },
  card: {
    background: '#18181b',
    padding: '20px',
    borderRadius: '10px',
    border: '1px solid #27272a',
    display: 'flex',
    flexDirection: 'column'
  },
  tableBox: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'left'
  },
  th: {
    padding: '8px',
    borderBottom: '1px solid #333',
    color: '#888'
  },
  td: {
    padding: '8px',
    borderBottom: '1px solid #222'
  },
  chatWindow: {
    flex: 1,
    height: '320px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    background: '#09090b',
    borderRadius: '8px',
    marginBottom: '12px'
  },
  bubble: {
    maxWidth: '80%',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap'
  },
  inputBar: {
    display: 'flex',
    gap: '8px'
  },
  chatInput: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #333',
    background: '#09090b',
    color: '#fff',
    outline: 'none'
  },
  sendBtn: {
    padding: '10px 18px',
    borderRadius: '6px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    cursor: 'pointer'
  },
  primaryBtn: {
    padding: '10px 20px',
    background: '#fff',
    color: '#000',
    borderRadius: '6px',
    border: 'none',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '6px 12px',
    background: 'transparent',
    color: '#aaa',
    border: '1px solid #444',
    borderRadius: '6px',
    cursor: 'pointer'
  }
}