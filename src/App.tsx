import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  ref, 
  set, 
  get, 
  push, 
  update, 
  remove, 
  onValue, 
  query, 
  orderByChild, 
  equalTo, 
  limitToFirst
} from 'firebase/database';
import { auth, db, googleProvider } from './firebase';

// --- Types ---
interface UserProfile {
  uid: string;
  email: string;
  username: string;
}

interface Game {
  id: string;
  name: string;
  masterId: string;
  players: string[];
  createdAt: number;
}

interface Sheet {
  id: string;
  gameId: string;
  playerId: string | null;
  type: 'player' | 'npc';
  visible?: boolean;
  class: string;
  header: {
    name: string;
    pronouns: string;
    heritage: string;
    subclass: string;
    level: number;
  };
  stats: {
    agility: number;
    strength: number;
    finesse: number;
    instinct: number;
    presence: number;
    knowledge: number;
  };
  defense: {
    evasion: number;
    armor: number;
  };
  health: {
    hp: number;
    hpMax: number;
    stress: number;
    stressMax: number;
    hope: number;
    hopeMax: number;
    thresholds: {
      minor: number;
      major: number;
      severe: number;
    };
  };
  experience: string[];
  inventory: string;
  notes: string;
  createdAt: number;
}

const DAGGERHEART_CLASSES = [
  { id: 'bard', name: 'Bardo', icon: 'Music', color: 'bg-purple-100 text-purple-700' },
  { id: 'druid', name: 'Druida', icon: 'Leaf', color: 'bg-green-100 text-green-700' },
  { id: 'guardian', name: 'Guardián', icon: 'Shield', color: 'bg-blue-100 text-blue-700' },
  { id: 'warrior', name: 'Guerrero', icon: 'Sword', color: 'bg-red-100 text-red-700' },
  { id: 'sorcerer', name: 'Hechicero', icon: 'Zap', color: 'bg-orange-100 text-orange-700' },
  { id: 'wizard', name: 'Mago', icon: 'Wand2', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'rogue', name: 'Pícaro', icon: 'Ghost', color: 'bg-gray-100 text-gray-700' },
  { id: 'seraph', name: 'Seráfico', icon: 'Sun', color: 'bg-yellow-100 text-yellow-700' },
];

import { 
  Music, 
  Leaf, 
  Shield, 
  Sword, 
  Zap, 
  Wand2, 
  Ghost, 
  Sun, 
  Plus, 
  X, 
  ChevronLeft, 
  Users, 
  User as UserIcon, 
  Trash2,
  Save,
  Menu,
  LogOut,
  Eye,
  EyeOff,
  Heart,
  Briefcase,
  Book
} from 'lucide-react';

const IconMap: Record<string, any> = {
  Music, Leaf, Shield, Sword, Zap, Wand2, Ghost, Sun
};

const REGISTRATION_CODE = 'dedaloputo123!';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;
  
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Algo salió mal.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) {
          message = `Error: ${parsed.error}`;
        }
      } catch (e) {
        message = this.state.error.message || String(this.state.error);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border-2 border-red-200">
            <h2 className="text-2xl font-bold text-red-700 mb-4">¡Vaya! Ha ocurrido un error</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Components ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'auth' | 'username' | 'dashboard' | 'game'>('auth');
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userRef = ref(db, `users/${u.uid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            const p = snapshot.val() as UserProfile;
            setProfile(p);
            setView('dashboard');
          } else {
            setView('username');
          }
        } catch (err) {
          console.error('Error loading profile:', err);
        }
      } else {
        setProfile(null);
        setView('auth');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-brand-100 selection:text-brand-900">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <AnimatePresence mode="wait">
          {view === 'auth' && (
            <motion.div key="auth" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <AuthView />
            </motion.div>
          )}
          {view === 'username' && user && (
            <motion.div key="username" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <UsernameView 
                user={user} 
                onComplete={(p) => { 
                  setProfile(p); 
                  setView('dashboard');
                }} 
                onCancel={() => {
                  signOut(auth);
                  setView('auth');
                }}
              />
            </motion.div>
          )}
          {view === 'dashboard' && profile && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <DashboardView 
                profile={profile} 
                onOpenGame={(id) => { setCurrentGameId(id); setView('game'); }} 
                onLogout={() => signOut(auth)}
              />
            </motion.div>
          )}
          {view === 'game' && profile && currentGameId && (
            <motion.div key="game" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
              <GameView 
                profile={profile} 
                gameId={currentGameId} 
                onBack={() => setView('dashboard')} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PendingView({ profile, onLogout }: { profile: UserProfile, onLogout: () => void }) {
  return (
    <div className="max-w-md mx-auto mt-12 text-center">
      <div className="glass rounded-[2rem] p-10 shadow-xl shadow-slate-200/50">
        <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
          <Shield size={40} />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Cuenta Pendiente</h2>
        <p className="text-slate-600 font-medium leading-relaxed mb-8">
          ¡Hola, <span className="text-brand-600 font-bold">{profile.username}</span>! Tu cuenta ha sido creada con éxito, pero debe ser aprobada por el administrador antes de que puedas entrar a las partidas.
        </p>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estado</p>
          <p className="text-amber-600 font-black uppercase tracking-widest text-sm mt-1">Esperando Aprobación</p>
        </div>
        <button 
          onClick={onLogout}
          className="w-full bg-slate-900 text-white p-4 rounded-2xl font-bold text-lg shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
        >
          <LogOut size={20} />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}

function AuthView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async () => {
    setError('');
    setStatusMessage('');
    setAuthLoading(true);

    try {
      if (isRegister) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (credential.user) {
          await sendEmailVerification(credential.user);
          await signOut(auth);
          setStatusMessage('Se envió un email de verificación. Revisa tu bandeja y luego inicia sesión de nuevo.');
          setIsRegister(false);
          return;
        }
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (credential.user && !credential.user.emailVerified) {
          await signOut(auth);
          setError('Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja y vuelve a intentarlo.');
          return;
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error en la autenticación.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setStatusMessage('');
    setAuthLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user && !result.user.emailVerified) {
        await signOut(auth);
        setError('Tu cuenta de Google no está verificada.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar con Google.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-10">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center justify-center w-20 h-20 bg-brand-600 text-white rounded-3xl shadow-xl shadow-brand-200 mb-6"
        >
          <Sword size={40} />
        </motion.div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">RolApp</h1>
        <p className="text-slate-500 font-medium">Tu mesa de rol, en cualquier lugar.</p>
      </div>

      <div className="glass rounded-[2rem] p-8 md:p-10 shadow-xl shadow-slate-200/50">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 text-red-600 p-4 mb-6 rounded-2xl text-sm font-semibold border border-red-100 overflow-hidden"
            >
              {error}
            </motion.div>
          )}
          {statusMessage && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-emerald-50 text-emerald-700 p-4 mb-6 rounded-2xl text-sm font-semibold border border-emerald-100 overflow-hidden"
            >
              {statusMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Email</label>
            <input 
              type="email" 
              placeholder="tu@email.com" 
              className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-medium"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Contraseña</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-medium"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button 
            onClick={handleAuth} 
            disabled={authLoading}
            className="w-full bg-slate-900 text-white p-4 rounded-2xl font-bold text-lg shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all mt-4 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {authLoading && (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            )}
            {isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}
          </button>

          <button 
            onClick={() => setIsRegister(!isRegister)} 
            className="w-full text-slate-500 text-sm font-bold hover:text-slate-800 transition-colors py-2"
          >
            {isRegister ? '¿Ya tienes cuenta? Entra aquí' : '¿No tienes cuenta? Regístrate gratis'}
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold tracking-widest">O continúa con</span></div>
          </div>

          <button 
            onClick={handleGoogle} 
            className="w-full bg-white border-2 border-slate-100 text-slate-700 p-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Google
          </button>
        </div>
      </div>
    </div>
  );
}

function UsernameView({ user, onComplete, onCancel }: { user: FirebaseUser, onComplete: (p: UserProfile) => void, onCancel: () => void }) {
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    if (!username) {
      setError('El nickname es obligatorio');
      return;
    }
    if (!inviteCode) {
      setError('La clave de registro es obligatoria');
      return;
    }
    if (inviteCode !== REGISTRATION_CODE) {
      setError('Código de registro incorrecto');
      return;
    }

    setIsSaving(true);
    try {
      // Check if username is already taken
      const usersRef = ref(db, 'users');
      const usernameQuery = query(usersRef, orderByChild('username'), equalTo(username));
      const snapshot = await get(usernameQuery);
      
      if (snapshot.exists() && Object.keys(snapshot.val()).length > 0) {
        setError('El nickname ya está en uso');
        return;
      }

      const profile: UserProfile = { uid: user.uid, email: user.email || '', username };
      const userRef = ref(db, `users/${user.uid}`);
      await set(userRef, profile);
      onComplete(profile);
    } catch (err: any) {
      console.error('Error creating profile:', err);
      setError('Error al crear la cuenta. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-10 relative">
        <button
          onClick={onCancel}
          className="absolute left-0 top-0 flex items-center gap-2 text-slate-400 hover:text-brand-600 font-bold transition-colors"
        >
          <ChevronLeft size={18} />
          Volver
        </button>
        <h2 className="text-3xl font-black text-slate-900 mb-2">Tu Identidad</h2>
        <p className="text-slate-500 font-medium">Elige cómo te verán otros jugadores.</p>
      </div>

      <div className="glass rounded-[2rem] p-8 md:p-10 shadow-xl shadow-slate-200/50">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 mb-6 rounded-2xl text-sm font-semibold border border-red-100">
            {error}
          </div>
        )}
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Nickname Único</label>
            <input 
              type="text" 
              placeholder="Ej: GranMago77" 
              className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-bold text-xl"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-3 ml-1 font-bold uppercase tracking-wider">Este nombre se usará para invitarte a partidas.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Clave de Registro</label>
            <input 
              type="password" 
              placeholder="Clave de registro" 
              className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-bold text-xl"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-3 ml-1 font-bold uppercase tracking-wider">Usa la clave de registro solicitada para completar tu cuenta.</p>
          </div>
          
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full bg-brand-600 text-white p-4 rounded-2xl font-bold text-lg shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isSaving && (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            )}
            Comenzar Aventura
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ profile, onOpenGame, onLogout }: { profile: UserProfile, onOpenGame: (id: string) => void, onLogout: () => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [newGameName, setNewGameName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'delete' | 'leave' } | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const isAdmin = profile.email === 'alexandertg.busse@gmail.com' && profile.username === 'alex';

  useEffect(() => {
    const gamesRef = ref(db, 'games');
    const unsubscribe = onValue(gamesRef, (snapshot) => {
      const allGames: Game[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(key => {
          allGames.push({ id: key, ...data[key] });
        });
      }
      
      const filtered = allGames.filter(g => g.masterId === profile.uid || (g.players && g.players.includes(profile.uid)));
      setGames(filtered.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => {
      console.error('Error loading games:', error);
    });

    return () => unsubscribe();
  }, [profile.uid]);

  const handleCreateGame = async () => {
    if (!newGameName.trim()) return;
    try {
      const gamesRef = ref(db, 'games');
      const newGameRef = push(gamesRef);
      const gameData = {
        name: newGameName,
        masterId: profile.uid,
        players: [],
        createdAt: Date.now()
      };
      await set(newGameRef, gameData);
      setNewGameName('');
      onOpenGame(newGameRef.key!);
    } catch (err) {
      console.error('Error creating game:', err);
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    try {
      // Delete all sheets for this game
      const sheetsRef = ref(db, 'sheets');
      const sheetsQuery = query(sheetsRef, orderByChild('gameId'), equalTo(gameId));
      const sheetsSnapshot = await get(sheetsQuery);
      
      if (sheetsSnapshot.exists()) {
        const updates: { [key: string]: null } = {};
        Object.keys(sheetsSnapshot.val()).forEach(sheetId => {
          updates[`sheets/${sheetId}`] = null;
        });
        await update(ref(db), updates);
      }
      
      // Delete the game
      await remove(ref(db, `games/${gameId}`));
      setConfirmDelete(null);
    } catch (err) {
      console.error('Error deleting game:', err);
    }
  };

  return (
    <div className="space-y-10">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Mis Partidas</h1>
          <p className="text-slate-500 font-medium">Bienvenido de nuevo, {profile.username}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button 
              onClick={() => setShowAdmin(!showAdmin)} 
              className={`p-3 rounded-2xl transition-all ${showAdmin ? 'bg-brand-600 text-white shadow-lg shadow-brand-100' : 'text-slate-400 hover:text-brand-600 hover:bg-brand-50'}`}
              title="Admin Dashboard"
            >
              <Shield size={24} />
            </button>
          )}
          <button 
            onClick={onLogout} 
            className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
            title="Cerrar Sesión"
          >
            <LogOut size={24} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </header>
      
      <section className="glass rounded-[2rem] p-6 md:p-8 shadow-xl shadow-slate-200/40">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ml-1">Nueva Aventura</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Nombre de la partida..." 
            className="flex-1 bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-bold text-lg"
            value={newGameName}
            onChange={(e) => setNewGameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateGame()}
          />
          <button 
            onClick={handleCreateGame} 
            className="bg-brand-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={24} />
            Crear
          </button>
        </div>
      </section>
      
      {showAdmin && isAdmin && <AdminDashboard profile={profile} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {games.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="md:col-span-2 py-20 text-center space-y-4"
            >
              <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto text-slate-300">
                <Sword size={40} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">No hay partidas aún</h3>
                <p className="text-slate-500 font-medium">Crea una nueva aventura arriba para comenzar.</p>
              </div>
            </motion.div>
          )}
          {games.map((game, index) => (
            <motion.div 
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              layout
            >
              <div 
                onClick={() => onOpenGame(game.id)} 
                className="glass rounded-[2rem] p-6 shadow-xl shadow-slate-200/30 cursor-pointer group hover:border-brand-200 hover:shadow-brand-100/30 transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({ id: game.id, type: 'delete' });
                    }}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
                      <Shield size={12} /> Master
                    </div>
                    <h4 className="text-2xl font-black text-slate-800 leading-tight group-hover:text-brand-600 transition-colors">{game.name}</h4>
                  </div>
                  <div className="mt-8 flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-widest">Entrar a la partida</span>
                    <ChevronLeft size={20} className="rotate-180 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        <InvitedGames profile={profile} onOpenGame={onOpenGame} />
      </div>

      {confirmDelete && confirmDelete.type === 'delete' && (
        <Modal 
          title="Eliminar Partida" 
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => handleDeleteGame(confirmDelete.id)}
          confirmText="Eliminar"
          confirmColor="bg-red-600"
        >
          <p className="text-slate-600 font-medium leading-relaxed">¿Estás seguro de eliminar esta partida? Esta acción es irreversible y borrará todos los personajes asociados.</p>
        </Modal>
      )}
    </div>
  );
}

function AdminDashboard({ profile }: { profile: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  useEffect(() => {
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const userList: UserProfile[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(key => {
          userList.push(data[key]);
        });
      }
      // Sort by username since Realtime DB doesn't support orderBy
      setUsers(userList.sort((a, b) => a.username.localeCompare(b.username)));
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await remove(ref(db, `users/${userToDelete}`));
      setUserToDelete(null);
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  const seedData = async () => {
    setLoading(true);
    setStatus('Generando escenario de prueba...');
    try {
      const testUsers = [
        { uid: 'test_gm_1', username: 'Maestro_Sombra', email: 'gm@test.com' },
        { uid: 'test_player_1', username: 'Kaelen_Elfo', email: 'p1@test.com' },
        { uid: 'test_player_2', username: 'Brog_Enano', email: 'p2@test.com' },
      ];

      // Create test users
      const userUpdates: { [key: string]: any } = {};
      testUsers.forEach(u => {
        userUpdates[`users/${u.uid}`] = u;
      });
      await update(ref(db), userUpdates);

      // Create test game
      const gamesRef = ref(db, 'games');
      const newGameRef = push(gamesRef);
      const gameData = {
        name: 'El Despertar del Vacío',
        masterId: 'test_gm_1',
        players: [profile.uid, 'test_player_1', 'test_player_2'],
        createdAt: Date.now()
      };
      await set(newGameRef, gameData);

      const sheets = [
        {
          gameId: newGameRef.key!,
          playerId: 'test_player_1',
          type: 'player',
          visible: true,
          class: 'wizard',
          header: { name: 'Kaelen', pronouns: 'él', heritage: 'Elfo Alto', subclass: 'Orden de los Elementos', level: 3 },
          stats: { agility: 1, strength: -1, finesse: 0, instinct: 2, presence: 1, knowledge: 3 },
          defense: { evasion: 12, armor: 1 },
          health: { hp: 14, hpMax: 18, stress: 2, stressMax: 6, hope: 4, hopeMax: 6, thresholds: { minor: 6, major: 12, severe: 18 } },
          experience: ['Magia Arcana', 'Historia Antigua'],
          inventory: 'Bastón de cristal, Túnica de seda, Libro de conjuros.',
          notes: 'Buscando el tomo perdido de su maestro.',
          createdAt: Date.now()
        },
        {
          gameId: newGameRef.key!,
          playerId: 'test_player_2',
          type: 'player',
          visible: true,
          class: 'warrior',
          header: { name: 'Brog', pronouns: 'él', heritage: 'Enano de las Montañas', subclass: 'Senda del Coloso', level: 3 },
          stats: { agility: -1, strength: 3, finesse: 1, instinct: 1, presence: 0, knowledge: 0 },
          defense: { evasion: 10, armor: 3 },
          health: { hp: 22, hpMax: 24, stress: 1, stressMax: 6, hope: 2, hopeMax: 6, thresholds: { minor: 8, major: 16, severe: 24 } },
          experience: ['Herrería', 'Combate Pesado'],
          inventory: 'Hacha de batalla, Armadura de placas, Escudo de hierro.',
          notes: 'Juró proteger a Kaelen en su búsqueda.',
          createdAt: Date.now()
        }
      ];

      // Create test sheets
      const sheetUpdates: { [key: string]: any } = {};
      sheets.forEach(sheet => {
        const sheetRef = push(ref(db, 'sheets'));
        sheetUpdates[`sheets/${sheetRef.key}`] = { ...sheet, id: sheetRef.key };
      });
      await update(ref(db), sheetUpdates);

      setStatus('¡Escenario generado!');
      setTimeout(() => setStatus(''), 3000);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.section 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-[2rem] p-8 border-2 border-brand-100 shadow-xl shadow-brand-50/50 space-y-8 mb-12"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-100 text-brand-600 rounded-2xl">
            <Shield size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Panel de Administración</h3>
            <p className="text-slate-500 font-medium text-sm">Control total de la plataforma.</p>
          </div>
        </div>
        <button 
          onClick={seedData}
          disabled={loading}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          <Zap size={18} />
          {loading ? 'Generando...' : 'Generar Escenario de Prueba'}
        </button>
      </div>

      {status && (
        <div className="p-4 bg-brand-50 text-brand-700 rounded-2xl text-sm font-bold border border-brand-100">
          {status}
        </div>
      )}

      <div className="space-y-4">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Usuarios Registrados ({users.length})</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {users.map(u => (
            <div key={u.uid} className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-slate-100 group">
              <div>
                <p className="font-black text-slate-800">{u.username} {u.uid === profile.uid && <span className="text-brand-500 text-[10px] ml-1">(Tú)</span>}</p>
                <p className="text-xs text-slate-400 font-medium">{u.email}</p>
              </div>
              {u.uid !== profile.uid && (
                <button 
                  onClick={() => setUserToDelete(u.uid)}
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {userToDelete && (
        <Modal 
          title="Eliminar Usuario" 
          onClose={() => setUserToDelete(null)}
          onConfirm={handleDeleteUser}
          confirmText="Eliminar"
          confirmColor="bg-red-600"
        >
          <p className="text-slate-600 font-medium leading-relaxed">
            ¿Estás seguro de eliminar a este usuario? Se liberará su nickname y tendrá que registrarse de nuevo.
          </p>
        </Modal>
      )}
    </motion.section>
  );
}

function InvitedGames({ profile, onOpenGame }: { profile: UserProfile, onOpenGame: (id: string) => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  useEffect(() => {
    const sheetsRef = ref(db, 'sheets');
    const sheetsQuery = query(sheetsRef, orderByChild('playerId'), equalTo(profile.uid));
    const unsubscribe = onValue(sheetsQuery, async (snapshot) => {
      const gameIds = new Set<string>();
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.values(data).forEach((sheet: any) => {
          gameIds.add(sheet.gameId);
        });
      }
      
      const gamesList: Game[] = [];
      for (const id of gameIds) {
        try {
          const gameSnapshot = await get(ref(db, `games/${id}`));
          if (gameSnapshot.exists()) {
            gamesList.push({ id: gameSnapshot.key!, ...gameSnapshot.val() });
          }
        } catch (err) {
          console.error('Error loading game:', err);
        }
      }
      setGames(gamesList.filter(g => g.masterId !== profile.uid));
    }, (error) => {
      console.error('Error loading invited games:', error);
    });
    return () => unsubscribe();
  }, [profile.uid]);

  const handleLeaveGame = async (gameId: string) => {
    try {
      // Delete all sheets for this player in this game
      const sheetsRef = ref(db, 'sheets');
      const sheetsQuery = query(sheetsRef, orderByChild('gameId'), equalTo(gameId));
      const sheetsSnapshot = await get(sheetsQuery);
      
      if (sheetsSnapshot.exists()) {
        const updates: { [key: string]: null } = {};
        const data = sheetsSnapshot.val();
        Object.keys(data).forEach(sheetId => {
          if (data[sheetId].playerId === profile.uid) {
            updates[`sheets/${sheetId}`] = null;
          }
        });
        await update(ref(db), updates);
      }
      
      // Remove player from game
      const gameRef = ref(db, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      if (gameSnapshot.exists()) {
        const currentPlayers = gameSnapshot.val().players || [];
        const newPlayers = currentPlayers.filter((uid: string) => uid !== profile.uid);
        await update(gameRef, { players: newPlayers });
      }
      setConfirmLeave(null);
    } catch (err) {
      console.error('Error leaving game:', err);
    }
  };

  if (games.length === 0) return null;

  return (
    <>
      <AnimatePresence mode="popLayout">
        {games.map((game, index) => (
          <motion.div 
            key={game.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (index + 2) * 0.05 }}
            layout
          >
            <div 
              onClick={() => onOpenGame(game.id)} 
              className="glass rounded-[2rem] p-6 shadow-xl shadow-slate-200/30 cursor-pointer group hover:border-emerald-200 hover:shadow-emerald-100/30 transition-all relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmLeave(game.id);
                  }}
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                >
                  <LogOut size={18} />
                </button>
              </div>
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
                    <UserIcon size={12} /> Jugador
                  </div>
                  <h4 className="text-2xl font-black text-slate-800 leading-tight group-hover:text-emerald-600 transition-colors">{game.name}</h4>
                </div>
                <div className="mt-8 flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-widest">Entrar a la partida</span>
                  <ChevronLeft size={20} className="rotate-180 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {confirmLeave && (
        <Modal 
          title="Salir de la Partida" 
          onClose={() => setConfirmLeave(null)}
          onConfirm={() => handleLeaveGame(confirmLeave)}
          confirmText="Salir"
          confirmColor="bg-red-600"
        >
          <p className="text-slate-600 font-medium leading-relaxed">¿Estás seguro de salir de esta partida? Se borrarán tus personajes asignados en ella.</p>
        </Modal>
      )}
    </>
  );
}

const CharacterCard: React.FC<{ sheet: Sheet, onClick: () => void, profile: UserProfile, isMaster?: boolean, onToggleVisibility?: (e: React.MouseEvent) => void | Promise<void> }> = ({ sheet, onClick, profile, isMaster, onToggleVisibility }) => {
  const cls = DAGGERHEART_CLASSES.find(c => c.id === sheet.class);
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="glass rounded-[2rem] p-6 shadow-xl shadow-slate-200/30 cursor-pointer group hover:border-brand-200 hover:shadow-brand-100/30 transition-all relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-6">
        <div className={`p-3 rounded-2xl ${cls?.color || 'bg-slate-100 text-slate-600'} shadow-sm`}>
          {React.createElement(IconMap[cls?.icon || 'UserIcon'] || UserIcon, { size: 28 })}
        </div>
        <div className="flex items-center gap-2">
          {isMaster && sheet.type === 'npc' && (
            <button 
              onClick={onToggleVisibility}
              className={`p-2 rounded-xl transition-all ${sheet.visible ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              title={sheet.visible ? 'Ocultar a jugadores' : 'Mostrar a jugadores'}
            >
              {sheet.visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          )}
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{sheet.class}</span>
        </div>
      </div>
      
      <div>
        <h3 className="text-2xl font-black text-slate-800 mb-1 group-hover:text-brand-600 transition-colors truncate">{sheet.header?.name || 'Sin nombre'}</h3>
        <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest">
          <span>Nivel {sheet.header?.level || 1}</span>
          <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
          <span className="truncate">{sheet.header?.subclass || 'Sin subclase'}</span>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-50 flex justify-between items-center">
        <div className="flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < (sheet.header?.level || 1) ? 'bg-brand-400' : 'bg-slate-100'}`}></div>
          ))}
        </div>
        <ChevronLeft size={18} className="rotate-180 text-slate-300 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
      </div>
    </motion.div>
  );
};

function GameView({ profile, gameId, onBack }: { profile: UserProfile, gameId: string, onBack: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [inviteName, setInviteName] = useState('');
  const [error, setError] = useState('');
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [creationType, setCreationType] = useState<'player' | 'npc'>('player');
  const [assignToPlayerId, setAssignToPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const gameRef = ref(db, `games/${gameId}`);
    const unsubscribeGame = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        setGame({ id: snapshot.key!, ...snapshot.val() } as Game);
      }
    }, (error) => {
      console.error('Error loading game:', error);
    });

    const sheetsRef = ref(db, 'sheets');
    const sheetsQuery = query(sheetsRef, orderByChild('gameId'), equalTo(gameId));
    const unsubscribeSheets = onValue(sheetsQuery, (snapshot) => {
      const docs: Sheet[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(key => {
          docs.push({ id: key, ...data[key] });
        });
      }
      setSheets(docs.sort((a, b) => (a.header?.name || '').localeCompare(b.header?.name || '')));
    }, (error) => {
      console.error('Error loading sheets:', error);
    });

    return () => {
      unsubscribeGame();
      unsubscribeSheets();
    };
  }, [gameId]);

  const handleInvite = async () => {
    if (!inviteName) return;
    try {
      const usersRef = ref(db, 'users');
      const usernameQuery = query(usersRef, orderByChild('username'), equalTo(inviteName), limitToFirst(1));
      const snapshot = await get(usernameQuery);
      
      if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
        return setError('Usuario no encontrado');
      }
      
      const userId = Object.keys(snapshot.val())[0];
      const playerData = snapshot.val()[userId] as UserProfile;
      
      // Update game players list
      const gameRef = ref(db, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      if (gameSnapshot.exists()) {
        const currentPlayers = gameSnapshot.val().players || [];
        if (!currentPlayers.includes(playerData.uid)) {
          await update(gameRef, { players: [...currentPlayers, playerData.uid] });
        }
      }

      setInviteName('');
      setError('');
    } catch (err: any) {
      console.error('Error inviting user:', err);
      setError('Error al invitar usuario');
    }
  };

  const createCharacter = async (classId: string, assignedId: string | null) => {
    try {
      const sheetsRef = ref(db, 'sheets');
      const newSheetRef = push(sheetsRef);
      const newSheet: Sheet = {
        id: newSheetRef.key!,
        gameId,
        playerId: creationType === 'player' ? (assignedId || profile.uid) : null,
        type: creationType,
        visible: creationType === 'player' ? true : false,
        class: classId,
        header: { name: 'Nuevo Personaje', pronouns: '', heritage: '', subclass: '', level: 1 },
        stats: { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
        defense: { evasion: 10, armor: 0 },
        health: { hp: 6, hpMax: 6, stress: 0, stressMax: 6, hope: 0, hopeMax: 6, thresholds: { minor: 5, major: 10, severe: 15 } },
        experience: [],
        inventory: '',
        notes: '',
        createdAt: Date.now()
      };
      await set(newSheetRef, newSheet);
      setSelectedSheetId(newSheetRef.key!);
      setShowCreationModal(false);
    } catch (err) {
      console.error('Error creating character:', err);
    }
  };

  const deleteSheet = async (id: string) => {
    try {
      await remove(ref(db, `sheets/${id}`));
      setSelectedSheetId(null);
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting sheet:', err);
    }
  };

  const toggleVisibility = async (e: React.MouseEvent, sheetId: string, current: boolean) => {
    e.stopPropagation();
    try {
      await update(ref(db, `sheets/${sheetId}`), { visible: !current });
    } catch (err) {
      console.error('Error toggling visibility:', err);
    }
  };

  if (!game) return (
    <div className="flex flex-col items-center justify-center py-20">
      <motion.div 
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-12 h-12 bg-slate-200 rounded-full mb-4"
      />
      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando partida...</p>
    </div>
  );

  const isMaster = game.masterId === profile.uid;
  const playerSheets = sheets.filter(s => s.type === 'player');
  const npcSheets = sheets.filter(s => s.type === 'npc');
  
  const mySheets = sheets.filter(s => s.playerId === profile.uid);
  const otherPlayerSheets = playerSheets.filter(s => s.playerId !== profile.uid);
  const visibleNpcs = npcSheets.filter(s => s.visible || isMaster);
  
  const currentSheet = sheets.find(s => s.id === selectedSheetId);

  if (selectedSheetId && currentSheet) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <button 
          onClick={() => setSelectedSheetId(null)} 
          className="group mb-8 inline-flex items-center gap-2 text-slate-400 hover:text-brand-600 font-bold transition-colors"
        >
          <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-brand-50 transition-colors">
            <ChevronLeft size={20} />
          </div>
          <span className="text-sm uppercase tracking-widest">Volver a la partida</span>
        </button>
        <CharacterSheet sheet={currentSheet} isMaster={isMaster} onBack={() => setSelectedSheetId(null)} onDelete={() => deleteSheet(currentSheet.id)} gameId={gameId} />
      </motion.div>
    );
  }

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <button 
            onClick={onBack} 
            className="group mb-4 inline-flex items-center gap-2 text-slate-400 hover:text-brand-600 font-bold transition-colors"
          >
            <ChevronLeft size={16} />
            <span className="text-xs uppercase tracking-widest">Dashboard</span>
          </button>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">{game.name}</h1>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">
            {isMaster ? <Shield size={12} /> : <UserIcon size={12} />}
            {isMaster ? 'Master' : 'Jugador'}
          </div>
        </div>

        {isMaster && (
          <div className="w-full md:w-auto glass rounded-3xl p-2 flex gap-2">
            <input 
              type="text" 
              placeholder="Invitar por nickname..." 
              className="flex-1 md:w-48 bg-transparent border-none p-3 rounded-2xl focus:ring-0 outline-none font-bold text-sm"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
            <button 
              onClick={handleInvite} 
              className="bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all"
            >
              Invitar
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-12">
        {/* Section: Players */}
        <section>
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {isMaster ? 'Personajes de Jugadores' : 'Mis Personajes'}
              </h2>
              <p className="text-slate-400 text-sm font-medium">Gestiona los héroes de la aventura.</p>
            </div>
            <button 
              onClick={() => { setCreationType('player'); setAssignToPlayerId(isMaster ? null : profile.uid); setShowCreationModal(true); }}
              className="bg-brand-600 text-white p-3 md:px-6 md:py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all flex items-center gap-2"
            >
              <Plus size={20} />
              <span className="hidden md:inline">{isMaster ? 'Crear para Jugador' : 'Nuevo Personaje'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {(isMaster ? playerSheets : mySheets).length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full py-20 glass rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300"
                >
                  <UserIcon size={64} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">{isMaster ? 'No hay personajes de jugadores aún' : 'No tienes personajes en esta partida'}</p>
                </motion.div>
              ) : (
                (isMaster ? playerSheets : mySheets).map((sheet, index) => (
                  <CharacterCard 
                    key={sheet.id} 
                    sheet={sheet} 
                    onClick={() => setSelectedSheetId(sheet.id)} 
                    profile={profile} 
                    isMaster={isMaster}
                    onToggleVisibility={(e) => toggleVisibility(e, sheet.id, !!sheet.visible)}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Section: NPCs */}
        <section>
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">NPCs y Criaturas</h2>
              <p className="text-slate-400 text-sm font-medium">Personajes no jugadores y amenazas.</p>
            </div>
            {isMaster && (
              <button 
                onClick={() => { setCreationType('npc'); setShowCreationModal(true); }}
                className="bg-slate-900 text-white p-3 md:px-6 md:py-3 rounded-2xl font-bold text-sm shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2"
              >
                <Plus size={20} />
                <span className="hidden md:inline">Crear NPC</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {visibleNpcs.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full py-20 glass rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300"
                >
                  <Users size={64} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">No hay NPCs visibles</p>
                </motion.div>
              ) : (
                visibleNpcs.map((sheet, index) => (
                  <CharacterCard 
                    key={sheet.id} 
                    sheet={sheet} 
                    onClick={() => setSelectedSheetId(sheet.id)} 
                    profile={profile} 
                    isMaster={isMaster}
                    onToggleVisibility={(e) => toggleVisibility(e, sheet.id, !!sheet.visible)}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Section: Other Players (only for players) */}
        {!isMaster && otherPlayerSheets.length > 0 && (
          <section>
            <div className="mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Compañeros</h2>
              <p className="text-slate-400 text-sm font-medium">Otros héroes en tu grupo.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {otherPlayerSheets.map(sheet => (
                <CharacterCard key={sheet.id} sheet={sheet} onClick={() => setSelectedSheetId(sheet.id)} profile={profile} />
              ))}
            </div>
          </section>
        )}
      </div>

      {showCreationModal && (
        <CharacterCreationModal 
          onClose={() => setShowCreationModal(false)} 
          onSelect={createCharacter} 
          type={creationType}
          gameId={gameId}
        />
      )}

      {showDeleteConfirm && (
        <Modal 
          title="Eliminar Personaje" 
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={() => deleteSheet(showDeleteConfirm)}
          confirmText="Eliminar"
          confirmColor="bg-red-600"
        >
          <p className="text-gray-600">¿Estás seguro de eliminar este personaje? Esta acción no se puede deshacer.</p>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, onConfirm, confirmText = "Confirmar", confirmColor = "bg-brand-600" }: { title: string, children: React.ReactNode, onClose: () => void, onConfirm?: () => void, confirmText?: string, confirmColor?: string }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100"
      >
        <div className="p-8 border-b border-slate-50 flex justify-between items-center">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 text-slate-400 rounded-2xl transition-all">
            <X size={24} />
          </button>
        </div>
        <div className="p-10">
          {children}
        </div>
        <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-3 font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
          {onConfirm && (
            <button 
              onClick={onConfirm} 
              className={`px-8 py-3 ${confirmColor} text-white rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg shadow-brand-100`}
            >
              {confirmText}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function CharacterCreationModal({ onClose, onSelect, type, gameId }: { onClose: () => void, onSelect: (id: string, playerId: string | null) => void, type: 'player' | 'npc', gameId: string }) {
  const [assignedPlayerId, setAssignedPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<{uid: string, username: string}[]>([]);

  useEffect(() => {
    if (type === 'player') {
      const fetchPlayers = async () => {
        try {
          const gameSnapshot = await get(ref(db, `games/${gameId}`));
          if (gameSnapshot.exists()) {
            const uids = gameSnapshot.val().players || [];
            const playerList = [];
            for (const uid of uids) {
              try {
                const userSnapshot = await get(ref(db, `users/${uid}`));
                if (userSnapshot.exists()) {
                  playerList.push({ uid, username: userSnapshot.val().username });
                }
              } catch (err) {
                console.error('Error fetching user:', err);
              }
            }
            setPlayers(playerList);
          }
        } catch (err) {
          console.error('Error fetching game:', err);
        }
      };
      fetchPlayers();
    }
  }, [gameId, type]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[3rem] w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-100"
      >
        <div className="p-8 md:p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Crear {type === 'npc' ? 'NPC' : 'Héroe'}</h2>
            <p className="text-slate-400 font-medium mt-1">
              {type === 'npc' ? 'Los NPCs se crean ocultos por defecto.' : 'Selecciona una clase para comenzar tu aventura.'}
            </p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white text-slate-400 rounded-2xl transition-all shadow-sm">
            <X size={28} />
          </button>
        </div>
        
        <div className="p-8 md:p-10 max-h-[70vh] overflow-y-auto no-scrollbar">
          {type === 'player' && players.length > 0 && (
            <div className="mb-10 p-6 bg-brand-50 rounded-3xl border-2 border-brand-100">
              <label className="block text-[10px] font-black text-brand-600 uppercase tracking-widest mb-3">Asignar a Jugador (Opcional)</label>
              <select 
                className="w-full bg-white border-none rounded-2xl p-4 font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-brand-500"
                value={assignedPlayerId || ''}
                onChange={(e) => setAssignedPlayerId(e.target.value || null)}
              >
                <option value="">Para mí</option>
                {players.map(p => (
                  <option key={p.uid} value={p.uid}>{p.username}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {DAGGERHEART_CLASSES.map((cls, index) => (
              <motion.button 
                key={cls.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => onSelect(cls.id, assignedPlayerId)}
                className="flex flex-col items-center gap-4 p-6 rounded-[2rem] border-2 border-transparent hover:border-brand-200 hover:bg-brand-50/30 transition-all group"
              >
                <div className={`p-5 rounded-3xl ${cls.color} shadow-lg group-hover:scale-110 group-hover:-rotate-3 transition-all duration-300`}>
                  {React.createElement(IconMap[cls.icon], { size: 36 })}
                </div>
                <span className="font-black text-slate-700 tracking-tight">{cls.name}</span>
              </motion.button>
            ))}
          </div>
        </div>
        
        <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex justify-end">
          <button onClick={onClose} className="px-8 py-3 font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
        </div>
      </motion.div>
    </div>
  );
}

const STAT_NAMES = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const STAT_LABELS: Record<string, string> = {
  agility: 'Agilidad',
  strength: 'Fuerza',
  finesse: 'Destreza',
  instinct: 'Instinto',
  presence: 'Presencia',
  knowledge: 'Conocimiento'
};

function CharacterSheet({ sheet, isMaster, onBack, onDelete, gameId }: { sheet: Sheet, isMaster: boolean, onBack: () => void, onDelete: () => void, gameId: string }) {
  const [data, setData] = useState<Sheet>(sheet);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [players, setPlayers] = useState<{uid: string, username: string}[]>([]);
  const [damageInput, setDamageInput] = useState('');

  useEffect(() => {
    setData(sheet);
  }, [sheet]);

  useEffect(() => {
    if (isMaster) {
      const fetchPlayers = async () => {
        try {
          const gameSnapshot = await get(ref(db, `games/${gameId}`));
          if (gameSnapshot.exists()) {
            const uids = gameSnapshot.val().players || [];
            const playerList = [];
            for (const uid of uids) {
              const userSnapshot = await get(ref(db, `users/${uid}`));
              if (userSnapshot.exists()) playerList.push({ uid, username: userSnapshot.val().username });
            }
            setPlayers(playerList);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchPlayers();
    }
  }, [gameId, isMaster]);

  const update = async (path: string, value: any) => {
    // Optimistic local update
    const newData = JSON.parse(JSON.stringify(data));
    const keys = path.split('.');
    let current: any = newData;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    setData(newData);

    try {
      await set(ref(db, `sheets/${sheet.id}`), newData);
    } catch (err) {
      console.error('Error updating sheet:', err);
    }
  };

  const applyDamage = async () => {
    const dmg = parseInt(damageInput);
    if (isNaN(dmg)) return;
    
    let hpLoss = 0;
    if (dmg >= data.health.thresholds.severe) hpLoss = 3;
    else if (dmg >= data.health.thresholds.major) hpLoss = 2;
    else if (dmg >= data.health.thresholds.minor) hpLoss = 1;

    if (hpLoss > 0) {
      const newHp = Math.max(0, data.health.hp - hpLoss);
      await update('health.hp', newHp);
    }
    setDamageInput('');
  };

  const cls = DAGGERHEART_CLASSES.find(c => c.id === data.class);

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section */}
      <header className="glass rounded-[2.5rem] p-8 md:p-10 shadow-xl shadow-slate-200/40 relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-2 ${cls?.color || 'bg-brand-500'}`} />
        
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className={`p-6 rounded-3xl ${cls?.color || 'bg-slate-100 text-slate-600'} shadow-inner`}>
            {React.createElement(IconMap[cls?.icon || 'UserIcon'] || UserIcon, { size: 48 })}
          </div>
          
          <div className="flex-1 space-y-4 w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <input 
                  type="text" 
                  className="text-4xl font-black text-slate-900 bg-transparent border-none p-0 focus:ring-0 w-full md:w-auto uppercase tracking-tighter"
                  value={data.header?.name || ''}
                  onChange={(e) => update('header.name', e.target.value)}
                  placeholder="NOMBRE DEL PERSONAJE"
                />
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest">{cls?.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Nivel</span>
                    <input 
                      type="number"
                      className="w-10 text-center font-black text-slate-800 bg-slate-100 rounded-lg py-0.5 border-none focus:ring-0"
                      value={data.header?.level || 1}
                      onChange={(e) => update('header.level', parseInt(e.target.value))}
                    />
                  </div>
                  <span className="text-slate-300">•</span>
                  <input 
                    type="text" 
                    className="text-slate-500 text-xs font-bold uppercase tracking-widest bg-transparent border-none p-0 focus:ring-0 w-32"
                    value={data.header?.subclass || ''}
                    onChange={(e) => update('header.subclass', e.target.value)}
                    placeholder="SUBCLASE"
                  />
                </div>
              </div>

              {isMaster && (
                <div className="flex items-center gap-3">
                  {data.type === 'player' && (
                    <select 
                      className="bg-slate-50 border-none rounded-xl px-4 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-brand-500"
                      value={data.playerId || ''}
                      onChange={(e) => update('playerId', e.target.value || null)}
                    >
                      <option value="">Sin asignar</option>
                      {players.map(p => <option key={p.uid} value={p.uid}>{p.username}</option>)}
                    </select>
                  )}
                  <button 
                    onClick={() => update('visible', !data.visible)}
                    className={`p-2 rounded-xl transition-all ${data.visible ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}
                    title={data.visible ? 'Visible para jugadores' : 'Oculto para jugadores'}
                  >
                    {data.visible ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Linaje</label>
                <input type="text" className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700" value={data.header?.heritage || ''} onChange={(e) => update('header.heritage', e.target.value)} placeholder="Ej: Elfo" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Pronombres</label>
                <input type="text" className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700" value={data.header?.pronouns || ''} onChange={(e) => update('header.pronouns', e.target.value)} placeholder="Ej: él/ella" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Stats Column */}
        <div className="lg:col-span-4 space-y-8">
          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Zap size={14} /> Atributos
            </h3>
            <div className="space-y-4">
              {STAT_NAMES.map(stat => {
                const val = data.stats[stat as keyof typeof data.stats];
                return (
                  <div key={stat} className="flex items-center justify-between group">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{STAT_LABELS[stat]}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => update(`stats.${stat}`, val - 1)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors flex items-center justify-center">-</button>
                      <span className="w-10 text-center text-xl font-black text-slate-900">{val >= 0 ? `+${val}` : val}</span>
                      <button onClick={() => update(`stats.${stat}`, val + 1)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors flex items-center justify-center">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Shield size={14} /> Defensa
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="text-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Evasión</label>
                <input type="number" className="w-full text-center text-3xl font-black text-slate-900 bg-slate-50 rounded-2xl py-4 border-none focus:ring-0" value={data.defense?.evasion} onChange={(e) => update('defense.evasion', parseInt(e.target.value))} />
              </div>
              <div className="text-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Armadura</label>
                <input type="number" className="w-full text-center text-3xl font-black text-slate-900 bg-slate-50 rounded-2xl py-4 border-none focus:ring-0" value={data.defense?.armor} onChange={(e) => update('defense.armor', parseInt(e.target.value))} />
              </div>
            </div>
          </section>
        </div>

        {/* Health & Main Column */}
        <div className="lg:col-span-8 space-y-8">
          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Heart size={14} /> Vitalidad
              </h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrés</span>
                  <input type="number" className="w-12 text-center font-black text-slate-700 bg-slate-50 rounded-lg py-1 border-none focus:ring-0" value={data.health?.stress} onChange={(e) => update('health.stress', parseInt(e.target.value))} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Esperanza</span>
                  <input type="number" className="w-12 text-center font-black text-brand-600 bg-brand-50 rounded-lg py-1 border-none focus:ring-0" value={data.health?.hope} onChange={(e) => update('health.hope', parseInt(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Puntos de Vida</span>
                    <div className="flex items-center gap-2">
                      <input type="number" className="w-16 text-center text-2xl font-black text-red-600 bg-transparent border-none p-0 focus:ring-0" value={data.health?.hp} onChange={(e) => update('health.hp', parseInt(e.target.value))} />
                      <span className="text-slate-300 text-xl">/</span>
                      <input type="number" className="w-16 text-center text-2xl font-black text-slate-400 bg-transparent border-none p-0 focus:ring-0" value={data.health?.hpMax} onChange={(e) => update('health.hpMax', parseInt(e.target.value))} />
                    </div>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(data.health?.hp / data.health?.hpMax) * 100}%` }}
                      className="h-full bg-red-500"
                    />
                  </div>
                </div>

                <div className="w-full md:w-48 p-4 bg-slate-900 rounded-2xl shadow-lg">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Calculadora Daño</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      className="w-full bg-slate-800 border-none rounded-xl px-3 py-2 text-white font-black focus:ring-1 focus:ring-brand-500" 
                      placeholder="DMG"
                      value={damageInput}
                      onChange={(e) => setDamageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && applyDamage()}
                    />
                    <button onClick={applyDamage} className="p-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-all">
                      <Zap size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4">
                {['minor', 'major', 'severe'].map((t) => (
                  <div key={t} className="text-center p-4 bg-slate-50 rounded-2xl">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t}</label>
                    <input type="number" className="w-full text-center font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0" value={data.health?.thresholds[t as keyof typeof data.health.thresholds]} onChange={(e) => update(`health.thresholds.${t}`, parseInt(e.target.value))} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Briefcase size={14} /> Inventario
              </h3>
              <textarea 
                className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[150px] focus:ring-2 focus:ring-brand-500 outline-none"
                value={data.inventory}
                onChange={(e) => update('inventory', e.target.value)}
                placeholder="Equipo, armas, pociones..."
              />
            </section>

            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Book size={14} /> Notas
              </h3>
              <textarea 
                className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[150px] focus:ring-2 focus:ring-brand-500 outline-none"
                value={data.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Historia, objetivos, secretos..."
              />
            </section>
          </div>
        </div>
      </div>

      <footer className="flex justify-center pt-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Sincronizado en tiempo real
        </div>
      </footer>

      {showDeleteConfirm && (
        <Modal 
          title="Eliminar Personaje" 
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={onDelete}
          confirmText="Eliminar"
          confirmColor="bg-red-600"
        >
          <p className="text-slate-600 font-medium leading-relaxed">¿Estás seguro de eliminar este personaje? Esta acción no se puede deshacer.</p>
        </Modal>
      )}
    </div>
  );
}

function ResourceBar({ label, val, max, color, onUpdate }: { label: string, val: number, max: number, color: string, onUpdate: (v: number) => void }) {
  return (
    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
      <span className="block text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">{label}</span>
      <div className="flex items-center justify-between gap-4">
        <button onClick={() => onUpdate(Math.max(0, val - 1))} className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center font-black text-slate-400 hover:text-slate-800 transition-all">-</button>
        <div className="flex-1 text-center">
          <span className="text-3xl font-black text-slate-800">{val}</span>
          <span className="text-sm font-bold text-slate-300 mx-2">/</span>
          <span className="text-sm font-bold text-slate-400">{max}</span>
        </div>
        <button onClick={() => onUpdate(Math.min(max, val + 1))} className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center font-black text-slate-400 hover:text-slate-800 transition-all">+</button>
      </div>
      <div className="mt-6 h-2.5 bg-slate-200 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${(val / max) * 100}%` }}
          className={`h-full ${color} transition-all duration-500`} 
        />
      </div>
    </div>
  );
}

function ThresholdBox({ label, val, onUpdate }: { label: string, val: number, onUpdate: (v: number) => void }) {
  return (
    <div className="text-center group">
      <span className="block text-[10px] font-black uppercase text-slate-500 mb-3 tracking-widest group-hover:text-slate-400 transition-colors">{label}</span>
      <input 
        type="number"
        className="text-4xl font-black bg-slate-800/50 border-none focus:ring-0 w-full text-center text-white rounded-2xl py-3 transition-all focus:bg-slate-800"
        value={val}
        onChange={(e) => onUpdate(parseInt(e.target.value))}
      />
    </div>
  );
}
