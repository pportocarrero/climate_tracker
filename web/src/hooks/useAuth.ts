import { useState, useEffect }                       from 'react'
import { onAuthStateChanged, signInWithPopup,
         signOut, type User }                        from 'firebase/auth'
import { auth, googleProvider }                      from '../firebase'

interface AuthState {
  user:     User | null
  loading:  boolean
  signIn:   () => Promise<void>
  signOut:  () => Promise<void>
}

export function useAuth(): AuthState {
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      console.error('Sign-in error:', err)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
  }

  return {
    user,
    loading,
    signIn:  handleSignIn,
    signOut: handleSignOut,
  }
}
