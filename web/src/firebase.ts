import { initializeApp }         from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore }          from 'firebase/firestore'

// VITE_FIREBASE_CONFIG is injected from the GitHub Secret at build time.
// Locally, set it in web/.env.local as:
//   VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"...",...}
const raw = import.meta.env.VITE_FIREBASE_CONFIG as string
if (!raw) {
  throw new Error(
    'Missing VITE_FIREBASE_CONFIG env var. ' +
    'Copy web/.env.example to web/.env.local and fill in your Firebase config.'
  )
}

const firebaseConfig = typeof raw === 'string' ? JSON.parse(raw) : raw

const app  = initializeApp(firebaseConfig)

export const auth      = getAuth(app)
export const db        = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
