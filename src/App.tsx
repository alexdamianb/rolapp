import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendEmailVerification, User as FirebaseUser
} from 'firebase/auth';
import {
  ref, set, get, push, update, remove, onValue, query,
  orderByChild, equalTo, limitToFirst
} from 'firebase/database';
import { auth, db, googleProvider } from './firebase';

// --- Types ---
interface UserProfile { uid: string; email: string; username: string; }
interface Game {
  id: string;
  name: string;
  masterId: string;
  players: Record<string, boolean>;
  createdAt: number;
}
interface DomainCard { id: string; name: string; domain: string; level: number; type: string; description: string; }
interface Sheet {
  id: string; gameId: string; playerId: string | null; type: 'player' | 'npc'; visible?: boolean;
  class: string; customClassName?: string; customClassIcon?: string; customClassColor?: string;
  header: { name: string; pronouns: string; heritage: string; community: string; subclass: string; level: number; };
  stats: { agility: number; strength: number; finesse: number; instinct: number; presence: number; knowledge: number; evasion: number;};
  defense: { armor: number; armorUsed: number; };
  health: { hp: number; hpMax: number; stress: number; stressMax: number; hope: number; thresholds: { major: number; severe: number; }; };
  ancestryFeatures: string; communityFeatures: string; classFeatures: string; subclassFeatures: string;
  hopeFeature: string; experiences: { label: string; bonus: number }[];
  inventory: string; notes: string; domainCards: DomainCard[]; createdAt: number;
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
  { id: 'ranger', name: 'Explorador', icon: 'Crosshair', color: 'bg-teal-100 text-teal-700' },
  { id: 'custom', name: 'Clase Propia', icon: 'Sparkles', color: 'bg-pink-100 text-pink-700' },
];

const ALL_ICONS = [
  'Music','Leaf','Shield','Sword','Zap','Wand2','Ghost','Sun','Crosshair',
  'Skull','FlameKindling','Swords','Axe','Feather','Crown','Star','Flame',
  'Bolt','Eye','Dna','Worm','Hammer','Spade','Sparkles'
];

import {
  Music, Leaf, Shield, Sword, Zap, Wand2, Ghost, Sun, Plus, X, ChevronLeft,
  Users, User as UserIcon, Trash2, Save, LogOut, Eye, EyeOff, Heart, Briefcase,
  Book, Crosshair, Skull, Flame, Crown, Star, Feather, Axe, Swords, Hammer,
  Sparkles, Pencil, Check, CreditCard, FlameKindling, Bolt, Dna, Worm, Spade
} from 'lucide-react';

const IconMap: Record<string, any> = {
  Music, Leaf, Shield, Sword, Zap, Wand2, Ghost, Sun, Crosshair,
  Skull, Flame, Crown, Star, Feather, Axe, Swords, Hammer, Sparkles,
  Eye, UserIcon, FlameKindling, Bolt, Dna, Worm, Spade
};

const REGISTRATION_CODE = 'dedaloputo123!';

interface ErrorBoundaryProps { children: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: any; }

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) { console.error('ErrorBoundary caught an error', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      let message = 'Algo salió mal.';
      try { const p = JSON.parse(this.state.error.message); if (p.error) message = `Error: ${p.error}`; }
      catch (e) { message = this.state.error.message || String(this.state.error); }
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border-2 border-red-200">
            <h2 className="text-2xl font-bold text-red-700 mb-4">¡Vaya! Ha ocurrido un error</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button onClick={() => window.location.reload()} className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors">Recargar Aplicación</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() { return <ErrorBoundary><AppContent /></ErrorBoundary>; }

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'auth' | 'username' | 'dashboard' | 'game'>('auth');
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await get(ref(db, `users/${u.uid}`));
          if (snap.exists()) { setProfile(snap.val() as UserProfile); setView('dashboard'); }
          else setView('username');
        } catch (err) { console.error('Error loading profile:', err); }
      } else { setProfile(null); setView('auth'); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-brand-100 selection:text-brand-900">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <AnimatePresence mode="wait">
          {view === 'auth' && <motion.div key="auth" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}><AuthView /></motion.div>}
          {view === 'username' && user && <motion.div key="username" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}><UsernameView user={user} onComplete={(p) => { setProfile(p); setView('dashboard'); }} onCancel={() => { signOut(auth); setView('auth'); }} /></motion.div>}
          {view === 'dashboard' && profile && <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}><DashboardView profile={profile} onOpenGame={(id) => { setCurrentGameId(id); setView('game'); }} onLogout={() => signOut(auth)} /></motion.div>}
          {view === 'game' && profile && currentGameId && <motion.div key="game" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}><GameView profile={profile} gameId={currentGameId} onBack={() => setView('dashboard')} /></motion.div>}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AuthView() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false); const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState(''); const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async () => {
    setError(''); setStatusMessage(''); setAuthLoading(true);
    try {
      if (isRegister) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (credential.user) { await sendEmailVerification(credential.user); await signOut(auth); setStatusMessage('Se envió un email de verificación.'); setIsRegister(false); return; }
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (credential.user && !credential.user.emailVerified) { await signOut(auth); setError('Debes verificar tu email antes de iniciar sesión.'); return; }
      }
    } catch (err: any) { setError(err.message || 'Error en la autenticación.'); }
    finally { setAuthLoading(false); }
  };

  const handleGoogle = async () => {
    setError(''); setStatusMessage(''); setAuthLoading(true);
    try { const result = await signInWithPopup(auth, googleProvider); if (result.user && !result.user.emailVerified) { await signOut(auth); setError('Tu cuenta de Google no está verificada.'); } }
    catch (err: any) { setError(err.message || 'Error al iniciar con Google.'); }
    finally { setAuthLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-10">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center justify-center w-20 h-20 bg-brand-600 text-white rounded-3xl shadow-xl shadow-brand-200 mb-6"><Sword size={40} /></motion.div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">RolApp</h1>
        <p className="text-slate-500 font-medium">Tu mesa de rol, en cualquier lugar.</p>
      </div>
      <div className="glass rounded-[2rem] p-8 md:p-10 shadow-xl shadow-slate-200/50">
        <AnimatePresence mode="wait">
          {error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-50 text-red-600 p-4 mb-6 rounded-2xl text-sm font-semibold border border-red-100 overflow-hidden">{error}</motion.div>}
          {statusMessage && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-emerald-50 text-emerald-700 p-4 mb-6 rounded-2xl text-sm font-semibold border border-emerald-100 overflow-hidden">{statusMessage}</motion.div>}
        </AnimatePresence>
        <div className="space-y-4">
          <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Email</label><input type="email" placeholder="tu@email.com" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-medium" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Contraseña</label><input type="password" placeholder="••••••••" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-medium" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button onClick={handleAuth} disabled={authLoading} className="w-full bg-slate-900 text-white p-4 rounded-2xl font-bold text-lg shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all mt-4 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3">
            {authLoading && <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" />}
            {isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}
          </button>
          <button onClick={() => setIsRegister(!isRegister)} className="w-full text-slate-500 text-sm font-bold hover:text-slate-800 transition-colors py-2">{isRegister ? '¿Ya tienes cuenta? Entra aquí' : '¿No tienes cuenta? Regístrate gratis'}</button>
          <div className="relative py-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold tracking-widest">O continúa con</span></div></div>
          <button onClick={handleGoogle} className="w-full bg-white border-2 border-slate-100 text-slate-700 p-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />Google</button>
        </div>
      </div>
    </div>
  );
}

function UsernameView({ user, onComplete, onCancel }: { user: FirebaseUser, onComplete: (p: UserProfile) => void, onCancel: () => void }) {
  const [username, setUsername] = useState(''); const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(''); const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    if (!username) { setError('El nickname es obligatorio'); return; }
    if (!inviteCode) { setError('La clave de registro es obligatoria'); return; }
    if (inviteCode !== REGISTRATION_CODE) { setError('Código de registro incorrecto'); return; }
    setIsSaving(true);
    try {
      const snap = await get(query(ref(db, 'users'), orderByChild('username'), equalTo(username)));
      if (snap.exists() && Object.keys(snap.val()).length > 0) { setError('El nickname ya está en uso'); return; }
      const profile: UserProfile = { uid: user.uid, email: user.email || '', username };
      await set(ref(db, `users/${user.uid}`), profile);
      onComplete(profile);
    } catch (err: any) { setError('Error al crear la cuenta.'); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-10 relative">
        <button onClick={onCancel} className="absolute left-0 top-0 flex items-center gap-2 text-slate-400 hover:text-brand-600 font-bold transition-colors"><ChevronLeft size={18} />Volver</button>
        <h2 className="text-3xl font-black text-slate-900 mb-2">Tu Identidad</h2>
        <p className="text-slate-500 font-medium">Elige cómo te verán otros jugadores.</p>
      </div>
      <div className="glass rounded-[2rem] p-8 md:p-10 shadow-xl shadow-slate-200/50">
        {error && <div className="bg-red-50 text-red-600 p-4 mb-6 rounded-2xl text-sm font-semibold border border-red-100">{error}</div>}
        <div className="space-y-6">
          <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Nickname Único</label><input type="text" placeholder="Ej: GranMago77" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-bold text-xl" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Clave de Registro</label><input type="password" placeholder="Clave de registro" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-bold text-xl" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} /></div>
          <button onClick={handleSave} disabled={isSaving} className="w-full bg-brand-600 text-white p-4 rounded-2xl font-bold text-lg shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3">
            {isSaving && <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" />}
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingGameName, setEditingGameName] = useState('');
  const isAdmin = profile.email === 'alexandertg.busse@gmail.com' && profile.username === 'alex';

  useEffect(() => {
    const unsub = onValue(ref(db, 'games'), (snap) => {
      const all: Game[] = [];
      if (snap.exists()) { const d = snap.val(); Object.keys(d).forEach(k => all.push({ id: k, ...d[k] })); }
      setGames(all.filter(g => g.masterId === profile.uid || (g.players && g.players[profile.uid])).sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => unsub();
  }, [profile.uid]);

  const handleCreateGame = async () => {
    if (!newGameName.trim()) return;
    try {
      const r = push(ref(db, 'games'));
      await set(r, { name: newGameName, masterId: profile.uid, players: {}, createdAt: Date.now() });
      setNewGameName('');
      onOpenGame(r.key!);
    } catch (err) { console.error(err); }
  };

  const handleRenameGame = async (gameId: string) => {
    if (!editingGameName.trim()) return;
    try { await update(ref(db, `games/${gameId}`), { name: editingGameName }); setEditingGameId(null); }
    catch (err) { console.error(err); }
  };

  const handleDeleteGame = async (gameId: string) => {
    try {
      await remove(ref(db, `gameSheets/${gameId}`));
      await remove(ref(db, `games/${gameId}`));
      setConfirmDelete(null);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-10">
      <header className="flex justify-between items-center">
        <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">Mis Partidas</h1><p className="text-slate-500 font-medium">Bienvenido de nuevo, {profile.username}</p></div>
        <div className="flex gap-2">
          {isAdmin && <button onClick={() => setShowAdmin(!showAdmin)} className={`p-3 rounded-2xl transition-all ${showAdmin ? 'bg-brand-600 text-white shadow-lg shadow-brand-100' : 'text-slate-400 hover:text-brand-600 hover:bg-brand-50'}`}><Shield size={24} /></button>}
          <button onClick={onLogout} className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"><LogOut size={24} className="group-hover:scale-110 transition-transform" /></button>
        </div>
      </header>

      <section className="glass rounded-[2rem] p-6 md:p-8 shadow-xl shadow-slate-200/40">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ml-1">Nueva Aventura</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Nombre de la partida..." className="flex-1 bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 focus:ring-0 outline-none font-bold text-lg" value={newGameName} onChange={(e) => setNewGameName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateGame()} />
          <button onClick={handleCreateGame} className="bg-brand-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all flex items-center justify-center gap-2"><Plus size={24} />Crear</button>
        </div>
      </section>

      {showAdmin && isAdmin && <AdminDashboard profile={profile} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {games.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="md:col-span-2 py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto text-slate-300"><Sword size={40} /></div>
              <div><h3 className="text-xl font-black text-slate-800">No hay partidas aún</h3><p className="text-slate-500 font-medium">Crea una nueva aventura arriba para comenzar.</p></div>
            </motion.div>
          )}
          {games.filter(g => g.masterId === profile.uid).map((game, i) => (
            <motion.div key={game.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} layout>
              <div onClick={() => { if (editingGameId !== game.id) onOpenGame(game.id); }} className="glass rounded-[2rem] p-6 shadow-xl shadow-slate-200/30 cursor-pointer group hover:border-brand-200 hover:shadow-brand-100/30 transition-all relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setEditingGameId(game.id); setEditingGameName(game.name); }} className="p-2 text-slate-300 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"><Pencil size={16} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(game.id); }} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                </div>
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4"><Shield size={12} /> Master</div>
                    {editingGameId === game.id ? (
                      <div className="flex gap-2 mt-1" onClick={e => e.stopPropagation()}>
                        <input className="flex-1 text-xl font-black text-slate-800 bg-slate-50 border-2 border-brand-300 rounded-xl px-3 py-1 focus:ring-0 outline-none" value={editingGameName} onChange={e => setEditingGameName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameGame(game.id); if (e.key === 'Escape') setEditingGameId(null); }} autoFocus />
                        <button onClick={() => handleRenameGame(game.id)} className="p-2 bg-brand-600 text-white rounded-xl"><Check size={18} /></button>
                        <button onClick={() => setEditingGameId(null)} className="p-2 bg-slate-100 text-slate-500 rounded-xl"><X size={18} /></button>
                      </div>
                    ) : (
                      <h4 className="text-2xl font-black text-slate-800 leading-tight group-hover:text-brand-600 transition-colors">{game.name}</h4>
                    )}
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

      {confirmDelete && <Modal title="Eliminar Partida" onClose={() => setConfirmDelete(null)} onConfirm={() => handleDeleteGame(confirmDelete)} confirmText="Eliminar" confirmColor="bg-red-600"><p className="text-slate-600 font-medium leading-relaxed">¿Estás seguro de eliminar esta partida? Esta acción es irreversible.</p></Modal>}
    </div>
  );
}

function AdminDashboard({ profile }: { profile: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [status, setStatus] = useState('');
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onValue(ref(db, 'users'), (snap) => {
      const list: UserProfile[] = [];
      if (snap.exists()) { const d = snap.val(); Object.keys(d).forEach(k => list.push(d[k])); }
      setUsers(list.sort((a, b) => a.username.localeCompare(b.username)));
    });
    return () => unsub();
  }, []);

  return (
    <motion.section initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-[2rem] p-8 border-2 border-brand-100 shadow-xl shadow-brand-50/50 space-y-8 mb-12">
      <div className="flex items-center gap-3"><div className="p-3 bg-brand-100 text-brand-600 rounded-2xl"><Shield size={24} /></div><div><h3 className="text-2xl font-black text-slate-800 tracking-tight">Panel de Administración</h3><p className="text-slate-500 font-medium text-sm">Control total de la plataforma.</p></div></div>
      {status && <div className="p-4 bg-brand-50 text-brand-700 rounded-2xl text-sm font-bold border border-brand-100">{status}</div>}
      <div className="space-y-4">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Usuarios Registrados ({users.length})</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {users.map(u => (
            <div key={u.uid} className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-slate-100 group">
              <div><p className="font-black text-slate-800">{u.username} {u.uid === profile.uid && <span className="text-brand-500 text-[10px] ml-1">(Tú)</span>}</p><p className="text-xs text-slate-400 font-medium">{u.email}</p></div>
              {u.uid !== profile.uid && <button onClick={() => setUserToDelete(u.uid)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>}
            </div>
          ))}
        </div>
      </div>
      {userToDelete && <Modal title="Eliminar Usuario" onClose={() => setUserToDelete(null)} onConfirm={async () => { await remove(ref(db, `users/${userToDelete}`)); setUserToDelete(null); }} confirmText="Eliminar" confirmColor="bg-red-600"><p className="text-slate-600 font-medium leading-relaxed">¿Eliminar este usuario?</p></Modal>}
    </motion.section>
  );
}

function InvitedGames({ profile, onOpenGame }: { profile: UserProfile, onOpenGame: (id: string) => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  useEffect(() => {
  const unsub = onValue(ref(db, 'games'), (snap) => {
    const list: Game[] = [];

    if (snap.exists()) {
      const d = snap.val();

      Object.keys(d).forEach(id => {
        const game = { id, ...d[id] } as Game;

        if (
          game.masterId !== profile.uid &&
          game.players &&
          game.players[profile.uid]
        ) {
          list.push(game);
        }
      });
    }

    setGames(list.sort((a, b) => a.name.localeCompare(b.name)));
  });

  return () => unsub();
}, [profile.uid]);

  const handleLeave = async (gameId: string) => {
    try {
      const snap = await get(ref(db, `gameSheets/${gameId}`));

      if (snap.exists()) {
        const u: any = {};
        const d = snap.val();

        Object.keys(d).forEach(id => {
          if (d[id].playerId === profile.uid) {
            u[`gameSheets/${gameId}/${id}`] = null;
          }
        });

        await update(ref(db), u);
      }
      await update(ref(db), {
      [`games/${gameId}/players/${profile.uid}`]: null
    });
      setConfirmLeave(null);
    } catch (err) { console.error(err); }
  };

  if (games.length === 0) return null;
  return (
    <>
      {games.map((game, i) => (
        <motion.div key={game.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 2) * 0.05 }} layout>
          <div onClick={() => onOpenGame(game.id)} className="glass rounded-[2rem] p-6 shadow-xl shadow-slate-200/30 cursor-pointer group hover:border-emerald-200 hover:shadow-emerald-100/30 transition-all relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4"><button onClick={(e) => { e.stopPropagation(); setConfirmLeave(game.id); }} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"><LogOut size={18} /></button></div>
            <div className="flex flex-col h-full justify-between">
              <div><div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4"><UserIcon size={12} /> Jugador</div><h4 className="text-2xl font-black text-slate-800 leading-tight group-hover:text-emerald-600 transition-colors">{game.name}</h4></div>
              <div className="mt-8 flex items-center justify-between text-slate-400"><span className="text-xs font-bold uppercase tracking-widest">Entrar a la partida</span><ChevronLeft size={20} className="rotate-180 group-hover:translate-x-1 transition-transform" /></div>
            </div>
          </div>
        </motion.div>
      ))}
      {confirmLeave && <Modal title="Salir de la Partida" onClose={() => setConfirmLeave(null)} onConfirm={() => handleLeave(confirmLeave)} confirmText="Salir" confirmColor="bg-red-600"><p className="text-slate-600 font-medium leading-relaxed">¿Salir de esta partida? Se borrarán tus personajes.</p></Modal>}
    </>
  );
}

const CharacterCard: React.FC<{ sheet: Sheet, onClick: () => void, profile: UserProfile, isMaster?: boolean, onToggleVisibility?: (e: React.MouseEvent) => void }> = ({ sheet, onClick, profile, isMaster, onToggleVisibility }) => {
  const cls = DAGGERHEART_CLASSES.find(c => c.id === sheet.class);
  const iconName = sheet.class === 'custom' ? (sheet.customClassIcon || 'Sparkles') : (cls?.icon || 'UserIcon');
  const className = sheet.class === 'custom' ? (sheet.customClassName || 'Clase Propia') : (cls?.name || sheet.class);
  const clsColor = sheet.class === 'custom'
  ? (sheet.customClassColor || 'bg-pink-100 text-pink-700')
  : (cls?.color || 'bg-slate-100 text-slate-600');
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ y: -4 }} onClick={onClick} className="glass rounded-[2rem] p-6 shadow-xl shadow-slate-200/30 cursor-pointer group hover:border-brand-200 hover:shadow-brand-100/30 transition-all relative overflow-hidden">
      <div className="flex items-start justify-between mb-6">
        <div className={`p-3 rounded-2xl ${clsColor} shadow-sm`}>{React.createElement(IconMap[iconName] || Sparkles, { size: 28 })}</div>
        <div className="flex items-center gap-2">
          {isMaster && sheet.type === 'npc' && <button onClick={onToggleVisibility} className={`p-2 rounded-xl transition-all ${sheet.visible ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{sheet.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>}
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{className}</span>
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
        <div className="flex gap-1">{[...Array(3)].map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < (sheet.header?.level || 1) ? 'bg-brand-400' : 'bg-slate-100'}`}></div>)}</div>
        <ChevronLeft size={18} className="rotate-180 text-slate-300 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
      </div>
    </motion.div>
  );
};

function GameView({ profile, gameId, onBack }: { profile: UserProfile, gameId: string, onBack: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [inviteName, setInviteName] = useState('');
  const [inviteSuggestions, setInviteSuggestions] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState('');
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [creationType, setCreationType] = useState<'player' | 'npc'>('player');

  useEffect(() => {
    const unsub1 = onValue(ref(db, `games/${gameId}`), (snap) => { if (snap.exists()) setGame({ id: snap.key!, ...snap.val() } as Game); });
    const unsub2 = onValue(ref(db, `gameSheets/${gameId}`), (snap) => {
      const docs: Sheet[] = [];

      if (snap.exists()) {
        const d = snap.val();
        Object.keys(d).forEach(k => docs.push({ ...d[k], id: k }));
      }

      setSheets(docs.sort((a, b) => (a.header?.name || '').localeCompare(b.header?.name || '')));
    });
    const unsub3 = onValue(ref(db, 'users'), (snap) => {
      if (snap.exists()) { const d = snap.val(); setAllUsers(Object.values(d) as UserProfile[]); }
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [gameId]);

  useEffect(() => {
    if (inviteName.trim().length > 0) {
      setInviteSuggestions(allUsers.filter(u => u.username.toLowerCase().includes(inviteName.toLowerCase()) && u.username !== profile.username).slice(0, 6));
    } else setInviteSuggestions([]);
  }, [inviteName, allUsers]);

  const handleInvite = async (username?: string) => {
    const name = username || inviteName;
    if (!name) return;
    try {
      const snap = await get(query(ref(db, 'users'), orderByChild('username'), equalTo(name), limitToFirst(1)));
      if (!snap.exists()) return setError('Usuario no encontrado');
      const userId = Object.keys(snap.val())[0];
      const playerData = snap.val()[userId] as UserProfile;
      const gs = await get(ref(db, `games/${gameId}`));
      if (gs.exists()) {
        const cur = gs.val().players || {};

      if (!cur[playerData.uid]) {
        await update(ref(db, `games/${gameId}/players`), {
          [playerData.uid]: true
        });
      }
      }
      setInviteName(''); setInviteSuggestions([]); setError('');
    } catch (err) { setError('Error al invitar usuario'); }
  };

const createCharacter = async (type: 'player' | 'npc') => {
  try {
    const r = push(ref(db, `gameSheets/${gameId}`));

    const newSheet: Sheet = {
      id: r.key!,
      gameId,
      playerId: type === 'player' ? profile.uid : null,
      type,
      visible: type === 'player',

      class: 'custom',
      customClassName: '',
      customClassIcon: 'Sparkles',
      customClassColor: 'bg-pink-100 text-pink-700',

      header: {
        name: 'Nuevo Personaje',
        pronouns: '',
        heritage: '',
        community: '',
        subclass: '',
        level: 1
      },

      stats: {
        agility: 0,
        strength: 0,
        finesse: 0,
        instinct: 0,
        presence: 0,
        knowledge: 0,
        evasion: 10
      },

      defense: {
        evasion: 10,
        armor: 3,
        armorUsed: 0
      },

      health: {
        hp: 6,
        hpMax: 6,
        stress: 0,
        stressMax: 6,
        hope: 0,
        thresholds: {
          major: 7,
          severe: 14
        }
      },

      ancestryFeatures: '',
      communityFeatures: '',
      classFeatures: '',
      subclassFeatures: '',
      hopeFeature: '',

      experiences: [
        { label: '', bonus: 2 },
        { label: '', bonus: 2 }
      ],

      inventory: '',
      notes: '',
      domainCards: [],
      createdAt: Date.now()
    };

    await set(r, newSheet);
    setSelectedSheetId(r.key!);
  } catch (err) {
    console.error(err);
  }
};

  const deleteSheet = async (id: string) => {
  try {
    await remove(ref(db, `gameSheets/${gameId}/${id}`));
    setSelectedSheetId(null);
  } catch (err) {
    console.error(err);
  }
};
  const toggleVisibility = async (e: React.MouseEvent, sheetId: string, current: boolean) => { e.stopPropagation(); try { await update(ref(db, `gameSheets/${gameId}/${sheetId}`), { visible: !current }); } catch (err) { console.error(err); } };

  if (!game) return <div className="flex flex-col items-center justify-center py-20"><motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="w-12 h-12 bg-slate-200 rounded-full mb-4" /><p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando partida...</p></div>;

  const isMaster = game.masterId === profile.uid;
  const participants = allUsers.filter(
  u => u.uid === game.masterId || !!game.players?.[u.uid]);
  const playerSheets = sheets.filter(s => s.type === 'player');
  const npcSheets = sheets.filter(s => s.type === 'npc');
  const mySheets = sheets.filter(s => s.playerId === profile.uid);
  const otherPlayerSheets = playerSheets.filter(s => s.playerId !== profile.uid);
  const visibleNpcs = npcSheets.filter(s => s.visible || isMaster);
  const currentSheet = sheets.find(s => s.id === selectedSheetId);

  if (selectedSheetId && currentSheet) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto">
        <button onClick={() => setSelectedSheetId(null)} className="group mb-8 inline-flex items-center gap-2 text-slate-400 hover:text-brand-600 font-bold transition-colors">
          <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-brand-50 transition-colors"><ChevronLeft size={20} /></div>
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
          <button onClick={onBack} className="group mb-4 inline-flex items-center gap-2 text-slate-400 hover:text-brand-600 font-bold transition-colors"><ChevronLeft size={16} /><span className="text-xs uppercase tracking-widest">Dashboard</span></button>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">{game.name}</h1>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">{isMaster ? <Shield size={12} /> : <UserIcon size={12} />}{isMaster ? 'Master' : 'Jugador'}</div>
        </div>
        {isMaster && (
          <div className="w-full md:w-auto glass rounded-3xl p-2 flex gap-2 relative">
            <div className="flex-1 relative">
              <input type="text" placeholder="Invitar por nickname..." className="w-full md:w-48 bg-transparent border-none p-3 rounded-2xl focus:ring-0 outline-none font-bold text-sm" value={inviteName} onChange={(e) => setInviteName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInvite()} />
              {inviteSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
                  {inviteSuggestions.map(u => (
                    <button key={u.uid} onClick={() => handleInvite(u.username)} className="w-full text-left px-4 py-3 hover:bg-brand-50 text-sm font-bold text-slate-700 border-b border-slate-50 last:border-0 flex items-center gap-2">
                      <div className="w-6 h-6 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center text-xs font-black">{u.username[0].toUpperCase()}</div>
                      {u.username}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => handleInvite()} className="bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all">Invitar</button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-12">
        <section className="glass rounded-[2rem] p-6 shadow-xl shadow-slate-200/30">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Users size={14} /> Participantes
        </h2>

        <div className="flex flex-wrap gap-3">
          {participants.map(u => (
            <div
              key={u.uid}
              className="flex items-center gap-3 bg-white/70 border border-slate-100 rounded-2xl px-4 py-3 shadow-sm"
            >
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black uppercase">
                {u.username?.[0] || '?'}
              </div>

              <div>
                <p className="text-sm font-black text-slate-700 leading-none">
                  {u.username}
                </p>

                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                  {u.uid === game.masterId ? 'Master' : 'Jugador'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
        <section>
          <div className="flex justify-between items-end mb-8">
            <div><h2 className="text-2xl font-black text-slate-900 tracking-tight">{isMaster ? 'Personajes de Jugadores' : 'Mis Personajes'}</h2><p className="text-slate-400 text-sm font-medium">Gestiona los héroes de la aventura.</p></div>
            <button onClick={() => createCharacter('player')} className="bg-brand-600 text-white p-3 md:px-6 md:py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all flex items-center gap-2"><Plus size={20} /><span className="hidden md:inline">{isMaster ? 'Crear para Jugador' : 'Nuevo Personaje'}</span></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {(isMaster ? playerSheets : mySheets).length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full py-20 glass rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300"><UserIcon size={64} className="mb-4 opacity-20" /><p className="font-bold uppercase tracking-widest text-xs">{isMaster ? 'No hay personajes aún' : 'No tienes personajes aquí'}</p></motion.div>
              ) : (
                (isMaster ? playerSheets : mySheets).map(sheet => <CharacterCard key={sheet.id} sheet={sheet} onClick={() => setSelectedSheetId(sheet.id)} profile={profile} isMaster={isMaster} onToggleVisibility={(e) => toggleVisibility(e, sheet.id, !!sheet.visible)} />)
              )}
            </AnimatePresence>
          </div>
        </section>

        <section>
          <div className="flex justify-between items-end mb-8">
            <div><h2 className="text-2xl font-black text-slate-900 tracking-tight">NPCs y Criaturas</h2><p className="text-slate-400 text-sm font-medium">Personajes no jugadores y amenazas.</p></div>
            {isMaster && <button onClick={() => createCharacter('npc')} className="bg-slate-900 text-white p-3 md:px-6 md:py-3 rounded-2xl font-bold text-sm shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2"><Plus size={20} /><span className="hidden md:inline">Crear NPC</span></button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {visibleNpcs.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full py-20 glass rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300"><Users size={64} className="mb-4 opacity-20" /><p className="font-bold uppercase tracking-widest text-xs">No hay NPCs visibles</p></motion.div>
              ) : (
                visibleNpcs.map(sheet => <CharacterCard key={sheet.id} sheet={sheet} onClick={() => setSelectedSheetId(sheet.id)} profile={profile} isMaster={isMaster} onToggleVisibility={(e) => toggleVisibility(e, sheet.id, !!sheet.visible)} />)
              )}
            </AnimatePresence>
          </div>
        </section>

        {!isMaster && otherPlayerSheets.length > 0 && (
          <section>
            <div className="mb-8"><h2 className="text-2xl font-black text-slate-900 tracking-tight">Compañeros</h2><p className="text-slate-400 text-sm font-medium">Otros héroes en tu grupo.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{otherPlayerSheets.map(sheet => <CharacterCard key={sheet.id} sheet={sheet} onClick={() => setSelectedSheetId(sheet.id)} profile={profile} />)}</div>
          </section>
        )}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose, onConfirm, confirmText = 'Confirmar', confirmColor = 'bg-brand-600' }: { title: string, children: React.ReactNode, onClose: () => void, onConfirm?: () => void, confirmText?: string, confirmColor?: string }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center"><h3 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h3><button onClick={onClose} className="p-2 hover:bg-slate-50 text-slate-400 rounded-2xl transition-all"><X size={24} /></button></div>
        <div className="p-10">{children}</div>
        <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-3 font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
          {onConfirm && <button onClick={onConfirm} className={`px-8 py-3 ${confirmColor} text-white rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg`}>{confirmText}</button>}
        </div>
      </motion.div>
    </div>
  );
}

const STAT_NAMES = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge', 'evasion'];
const STAT_LABELS: Record<string, string> = { agility: 'Agilidad', strength: 'Fuerza', finesse: 'Sutileza', instinct: 'Instinto', presence: 'Presencia', knowledge: 'Conocimiento', evasion: 'Evasión'};

function CharacterSheet({ sheet, isMaster, onBack, onDelete, gameId }: { sheet: Sheet, isMaster: boolean, onBack: () => void, onDelete: () => void, gameId: string }) {
  const [data, setData] = useState<Sheet>(sheet);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [players, setPlayers] = useState<{ uid: string, username: string }[]>([]);
  const [damageInput, setDamageInput] = useState('');
  const [damageResult, setDamageResult] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [newCardForm, setNewCardForm] = useState<DomainCard | null>(null);
  const [sheetTab, setSheetTab] = useState<'game' | 'details'>('game');

  useEffect(() => { setData(sheet); }, [sheet]);

  useEffect(() => {
    if (isMaster) {
      const fetch = async () => {
        try {
          const gs = await get(ref(db, `games/${gameId}`));
          if (gs.exists()) {
            const uids = Object.keys(gs.val().players || {});
            const list = [];
            for (const uid of uids) { const us = await get(ref(db, `users/${uid}`)); if (us.exists()) list.push({ uid, username: us.val().username }); }
            setPlayers(list);
          }
        } catch (err) { console.error(err); }
      };
      fetch();
    }
  }, [gameId, isMaster]);

  const updateField = async (path: string, value: any) => {
    const newData = JSON.parse(JSON.stringify(data));
    const keys = path.split('.');
    let cur: any = newData;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = value;
    setData(newData);
    try { await set(ref(db, `gameSheets/${gameId}/${sheet.id}`), newData); } catch (err) { console.error(err); }
  };

  const applyDamage = async () => {
    const dmg = parseInt(damageInput);
    if (isNaN(dmg)) return;
    const { major, severe } = data.health.thresholds;
    let hpLoss = 0; let label = '';
    if (dmg >= severe) { hpLoss = 3; label = `Daño Grave — pierde 3 PG`; }
    else if (dmg >= major) { hpLoss = 2; label = `Daño Mayor — pierde 2 PG`; }
    else if (dmg > 0) { hpLoss = 1; label = `Daño Menor — pierde 1 PG`; }
    else { setDamageResult('Sin daño (daño es 0 o negativo)'); setDamageInput(''); return; }
    const newHp = Math.min(data.health.hpMax, data.health.hp + hpLoss);
    await updateField('health.hp', newHp);
    setDamageResult(label);
    setDamageInput('');
    setTimeout(() => setDamageResult(''), 3000);
  };

  const addDomainCard = () => {
    setNewCardForm({ id: Date.now().toString(), name: '', domain: '', level: 1, type: 'Habilidad', description: '' });
  };

  const saveCard = async () => {
    if (!newCardForm) return;
    const cards = [...(data.domainCards || []), newCardForm];
    await updateField('domainCards', cards);
    setNewCardForm(null);
  };

  const deleteCard = async (cardId: string) => {
    const cards = (data.domainCards || []).filter(c => c.id !== cardId);
    await updateField('domainCards', cards);
  };

  const cls = DAGGERHEART_CLASSES.find(c => c.id === data.class);
  const getAccentDotColor = (color: string) =>
  color
    .replace('bg-purple-100', 'bg-purple-600')
    .replace('bg-green-100', 'bg-green-600')
    .replace('bg-blue-100', 'bg-blue-600')
    .replace('bg-red-100', 'bg-red-600')
    .replace('bg-orange-100', 'bg-orange-600')
    .replace('bg-indigo-100', 'bg-indigo-600')
    .replace('bg-gray-100', 'bg-gray-600')
    .replace('bg-yellow-100', 'bg-yellow-500')
    .replace('bg-teal-100', 'bg-teal-600')
    .replace('bg-pink-100', 'bg-pink-600')
    .replace(/text-[a-z]+-\d+/g, '');
  const iconName = data.class === 'custom' ? (data.customClassIcon || 'Sparkles') : (cls?.icon || 'UserIcon');
  const className = data.class === 'custom' ? (data.customClassName || 'Clase Propia') : (cls?.name || data.class);
  const clsColor = data.class === 'custom' ? (data.customClassColor || 'bg-pink-100 text-pink-700') : (cls?.color || 'bg-slate-100 text-slate-600');

  const { major, severe } = data.health.thresholds;
  const armorMax = data.defense.armor;
  const armorUsed = data.defense.armorUsed || 0;
  const armorRemaining = Math.max(0, armorMax - armorUsed);

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <header className="glass rounded-[2.5rem] p-8 md:p-10 shadow-xl shadow-slate-200/40 relative overflow-visible z-[100]">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="relative z-[300]">
            <div className={`p-6 rounded-3xl ${clsColor} shadow-inner`}>{React.createElement(IconMap[iconName] || Sparkles, { size: 48 })}</div>
            {data.class === 'custom' && (
              <button onClick={() => setShowIconPicker(!showIconPicker)} className="absolute -bottom-2 -right-2 p-1.5 bg-white rounded-xl shadow-md border border-slate-100 text-slate-400 hover:text-brand-600 transition-colors"><Pencil size={14} /></button>
            )}
           {showIconPicker && data.class === 'custom' && (
            <div className="absolute top-full left-0 mt-3 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-[500] w-80 max-h-[28rem] overflow-y-auto">
              <div className="mb-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Color
                </p>

                <div className="flex flex-wrap gap-3">
                  {DAGGERHEART_CLASSES.map(cls => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => updateField('customClassColor', cls.color)}
                      className={`w-7 h-7 rounded-full ${getAccentDotColor(cls.color)} border-2 transition-all ${
                        data.customClassColor === cls.color
                          ? 'border-slate-900 scale-110'
                          : 'border-white hover:border-slate-300'
                      }`}
                      title={cls.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Icono
                </p>

                <div className="grid grid-cols-6 gap-2">
                  {ALL_ICONS.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => {
                        updateField('customClassIcon', ic);
                      }}
                      className={`p-2 rounded-xl transition-all hover:bg-brand-50 ${
                        data.customClassIcon === ic
                          ? 'bg-brand-100 text-brand-600'
                          : 'text-slate-500'
                      }`}
                      title={ic}
                    >
                      {React.createElement(IconMap[ic] || Sparkles, { size: 20 })}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>

          <div className="flex-1 space-y-4 w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-10 rounded-full ${getAccentDotColor(clsColor)} shrink-0`} />

                  <input
                    type="text"
                    className="text-4xl font-black text-slate-900 bg-transparent border-none p-0 focus:ring-0 w-full uppercase tracking-tighter"
                    value={data.header?.name || ''}
                    onChange={(e) => updateField('header.name', e.target.value)}
                    placeholder="NOMBRE DEL PERSONAJE"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {data.class === 'custom' ? (<input
                    type="text"
                    className={`px-3 py-1 ${clsColor} rounded-full text-[10px] font-black uppercase tracking-widest border-none focus:ring-1 focus:ring-slate-300 w-32`}
                    value={data.customClassName || ''}
                    onChange={(e) => updateField('customClassName', e.target.value)}
                    placeholder="CLASE"
                  />
                    
                  ) : (
                    <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest">{cls?.name}</span>
                  )}
                  <div className="flex items-center gap-2"><span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Nivel</span><input type="number" className="w-10 text-center font-black text-slate-800 bg-slate-100 rounded-lg py-0.5 border-none focus:ring-0" value={data.header?.level || 1} onChange={(e) => updateField('header.level', parseInt(e.target.value))} /></div>
                  <span className="text-slate-300">•</span>
                  <input type="text" className="text-slate-500 text-xs font-bold uppercase tracking-widest bg-transparent border-none p-0 focus:ring-0 w-32" value={data.header?.subclass || ''} onChange={(e) => updateField('header.subclass', e.target.value)} placeholder="SUBCLASE" />
                </div>
              </div>
              {isMaster && (
                <div className="flex items-center gap-3">
                  {data.type === 'player' && <select className="bg-slate-50 border-none rounded-xl px-4 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-brand-500" value={data.playerId || ''} onChange={(e) => updateField('playerId', e.target.value || null)}><option value="">Sin asignar</option>{players.map(p => <option key={p.uid} value={p.uid}>{p.username}</option>)}</select>}
                  <button onClick={() => updateField('visible', !data.visible)} className={`p-2 rounded-xl transition-all ${data.visible ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>{data.visible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Herencia</label><input type="text" className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700" value={data.header?.heritage || ''} onChange={(e) => updateField('header.heritage', e.target.value)} placeholder="Ej: Humano" /></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Comunidad</label><input type="text" className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700" value={data.header?.community || ''} onChange={(e) => updateField('header.community', e.target.value)} placeholder="Ej: Highborne" /></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Pronombres</label><input type="text" className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700" value={data.header?.pronouns || ''} onChange={(e) => updateField('header.pronouns', e.target.value)} placeholder="Ej: él/ella" /></div>
            </div>
          </div>
        </div>
      </header>
      
      <div className="flex gap-1 w-fit mx-auto -mt-2 mb-2 bg-white/80 backdrop-blur-sm border border-slate-100 rounded-full p-1 shadow-lg shadow-slate-200/20">
        <button
          type="button"
          onClick={() => setSheetTab('game')}
          className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
            sheetTab === 'game'
              ? 'bg-slate-900 text-white'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          Juego
        </button>

        <button
          type="button"
          onClick={() => setSheetTab('details')}
          className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
            sheetTab === 'details'
              ? 'bg-slate-900 text-white'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          Detalles
        </button>
      </div>

      {sheetTab === 'game' && (
  <>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-8">
          {/* Stats */}
          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Zap size={14} /> Atributos</h3>
            <div className="space-y-4">
              {STAT_NAMES.map(stat => {
                const val = data.stats[stat as keyof typeof data.stats] ?? (stat === 'evasion' ? 10 : 0);
                return (
                  <div key={stat} className="flex items-center justify-between">
                    <span className="w-32 text-sm font-bold text-slate-500 uppercase tracking-widest shrink-0">{STAT_LABELS[stat]}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateField(`stats.${stat}`, val - 1)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors flex items-center justify-center">-</button>
                      <span className="w-10 text-center text-xl font-black text-slate-900">{stat === 'evasion' ? val : val >= 0 ? `+${val}` : val}</span>
                      <button onClick={() => updateField(`stats.${stat}`, val + 1)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors flex items-center justify-center">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Experiences */}
          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Star size={14} /> Experiencias
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-2 leading-relaxed">
                  Gasta 1 Esperanza para sumar una experiencia relevante a una tirada.
                </p>
              </div>

              <button
                onClick={() =>
                  updateField('experiences', [
                    ...(data.experiences || []),
                    { label: '', bonus: 2 }
                  ])
                }
                className="p-1.5 bg-slate-50 text-slate-400 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition-colors shrink-0"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {(data.experiences || []).map((exp, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 w-full min-w-0"
                >
                  <input
                    type="text"
                    className="flex-1 min-w-0 bg-slate-50 border-none rounded-xl px-3 py-2 text-sm font-medium text-slate-700 focus:ring-1 focus:ring-brand-300"
                    value={exp.label}
                    onChange={e => {
                      const exps = [...data.experiences];
                      exps[i] = { ...exps[i], label: e.target.value };
                      updateField('experiences', exps);
                    }}
                    placeholder="Ej: Ex guardia de palacio"
                  />

                  <div className="flex items-center bg-brand-50 text-brand-600 rounded-xl px-2 py-1 shrink-0">
                    <span className="text-[10px] font-black">+</span>
                    <input
                      type="number"
                      className="w-8 text-center font-black bg-transparent border-none p-0 focus:ring-0 text-sm text-brand-600"
                      value={exp.bonus}
                      onChange={e => {
                        const exps = [...data.experiences];
                        exps[i] = {
                          ...exps[i],
                          bonus: parseInt(e.target.value) || 0
                        };
                        updateField('experiences', exps);
                      }}
                    />
                  </div>

                  <button
                    onClick={() => {
                      const exps = data.experiences.filter((_, j) => j !== i);
                      updateField('experiences', exps);
                    }}
                    className="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 space-y-8">
          {/* Health */}
          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Heart size={14} /> Vitalidad</h3>

            {/* HP Bar */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Puntos de Golpe</span>
                <div className="flex items-center gap-2">
                  <input type="number" className="w-14 text-center text-2xl font-black text-red-600 bg-transparent border-none p-0 focus:ring-0" value={data.health?.hp} onChange={(e) => updateField('health.hp', parseInt(e.target.value) || 0)} />
                  <span className="text-slate-300 text-xl">/</span>
                  <input type="number" className="w-14 text-center text-2xl font-black text-slate-400 bg-transparent border-none p-0 focus:ring-0" value={data.health?.hpMax} onChange={(e) => updateField('health.hpMax', parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${data.health?.hpMax > 0 ? (data.health?.hp / data.health?.hpMax) * 100 : 0}%` }} className="h-full bg-red-500 rounded-full transition-all duration-300" />
              </div>
            </div>

        {/* Armor Bar */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-black text-slate-800 uppercase tracking-widest"> Armadura </span>
            <div className="flex items-center gap-2">
            <input
              type="number"
              className="w-14 text-center text-2xl font-black text-blue-600 bg-transparent border-none p-0 focus:ring-0"
              value={armorRemaining}
              onChange={(e) => {
                const remaining = parseInt(e.target.value) || 0;
                updateField(
                  'defense.armorUsed',
                  Math.max(0, armorMax - remaining)
                );
              }}
            />

            <span className="text-slate-300 text-xl">/</span>

            <input
              type="number"
              className="w-14 text-center text-2xl font-black text-slate-400 bg-transparent border-none p-0 focus:ring-0"
              value={armorMax}
              onChange={(e) => {
                const newMax = parseInt(e.target.value) || 0;
                updateField('defense.armor', newMax);
              }}
            />
            </div>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${armorMax > 0 ? (armorRemaining / armorMax) * 100 : 0}%`
                
              }}
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
            />
          </div>
        </div>

            {/* Stress Bar */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Estrés</span>
                <div className="flex items-center gap-2">
                  <input type="number" className="w-14 text-center text-2xl font-black text-amber-600 bg-transparent border-none p-0 focus:ring-0" value={data.health?.stress} onChange={(e) => updateField('health.stress', parseInt(e.target.value) || 0)} />
                  <span className="text-slate-300 text-xl">/</span>
                  <input type="number" className="w-14 text-center text-2xl font-black text-slate-400 bg-transparent border-none p-0 focus:ring-0" value={data.health?.stressMax} onChange={(e) => updateField('health.stressMax', parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${data.health?.stressMax > 0 ? (data.health?.stress / data.health?.stressMax) * 100 : 0}%` }} className="h-full bg-amber-400 rounded-full transition-all duration-300" />
              </div>
            </div>
          </section>

        <div className="flex gap-4 mb-6 items-stretch justify-between">
          {/* Hope */}
          <div className="flex-1 p-4 bg-white rounded-2xl border border-slate-100">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-2">
              Esperanza
            </label>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() =>
                  updateField('health.hope', Math.max(0, (data.health?.hope || 0) - 1))
                }
                className="w-10 h-10 rounded-xl bg-brand-500 text-white font-black text-xl hover:bg-white transition-colors"
              >
                -
              </button>

              <input
                type="number"
                className="w-20 text-center text-4xl font-black text-brand-600 bg-transparent border-none p-0 focus:ring-0"
                value={data.health?.hope || 0}
                onChange={(e) =>
                  updateField('health.hope', parseInt(e.target.value) || 0)
                }
              />

              <button
                type="button"
                onClick={() =>
                  updateField('health.hope', (data.health?.hope || 0) + 1)
                }
                className="w-10 h-10 rounded-xl bg-brand-500 text-white font-black text-xl hover:bg-white transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Damage calculator */}
          <div className="flex-1 p-4 bg-slate-900 rounded-2xl">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
              Calculadora de Daño
            </label>

            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 min-w-0 bg-slate-800 border-none rounded-xl px-3 py-2 text-white font-black focus:ring-1 focus:ring-brand-500"
                placeholder="Daño recibido..."
                value={damageInput}
                onChange={(e) => setDamageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyDamage()}
              />

              <button
                onClick={applyDamage}
                className="p-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-all"
              >
                <Zap size={16} />
              </button>
            </div>

            {damageResult && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-sm font-bold text-brand-400"
              >
                {damageResult}
              </motion.p>
            )}
          </div>
        </div>

            {/* Damage Thresholds */}
            <div className="space-y-3 p-5 bg-slate-900 rounded-2xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Umbrales de Daño</span>
                <span className="text-[10px] text-slate-500 font-medium">Menor / Mayor / Grave</span>
              </div>
              {/* Threshold bar visual */}
              <div className="relative h-6 bg-slate-700 rounded-full overflow-hidden">
                {major > 0 && severe > major && (
                  <>
                    <div className="absolute left-0 top-0 h-full bg-yellow-400 rounded-l-full" style={{ width: `${(major / (severe + 5)) * 100}%` }} />
                    <div className="absolute top-0 h-full bg-orange-500" style={{ left: `${(major / (severe + 5)) * 100}%`, width: `${((severe - major) / (severe + 5)) * 100}%` }} />
                    <div className="absolute top-0 h-full bg-red-500 rounded-r-full" style={{ left: `${(severe / (severe + 5)) * 100}%`, right: 0 }} />
                    <div className="absolute top-0 h-full flex items-center justify-around w-full px-2 pointer-events-none">
                      <span className="text-[9px] font-black text-white drop-shadow">Leve &lt;{major}</span>
                      <span className="text-[9px] font-black text-white drop-shadow">{major}–{severe - 1}</span>
                      <span className="text-[9px] font-black text-white drop-shadow">Grave ≥{severe}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center p-3 bg-slate-800 rounded-xl">
                  <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block mb-1">Umbral Mayor</label>
                  <input type="number" className="w-full text-center font-black text-white bg-transparent border-none p-0 focus:ring-0 text-xl" value={data.health?.thresholds?.major || 0} onChange={(e) => updateField('health.thresholds.major', parseInt(e.target.value) || 0)} />
                  <p className="text-[9px] text-slate-500 mt-1">≥ este valor: 2 PG</p>
                </div>
                <div className="text-center p-3 bg-slate-800 rounded-xl">
                  <label className="text-[10px] font-black text-red-400 uppercase tracking-widest block mb-1">Umbral Grave</label>
                  <input type="number" className="w-full text-center font-black text-white bg-transparent border-none p-0 focus:ring-0 text-xl" value={data.health?.thresholds?.severe || 0} onChange={(e) => updateField('health.thresholds.severe', parseInt(e.target.value) || 0)} />
                  <p className="text-[9px] text-slate-500 mt-1">≥ este valor: 3 PG</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 text-center">Daño bajo Mayor: 1 PG (Leve)</p>
            </div>
        </div>
      </div>
          {/* Domain Cards */}
          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CreditCard size={14} /> Cartas de Dominio</h3>
              <button onClick={addDomainCard} className="p-2 bg-slate-50 text-slate-400 hover:bg-brand-50 hover:text-brand-600 rounded-xl transition-colors"><Plus size={18} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(data.domainCards || []).map((card) => (
                <div key={card.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group relative">
                  <button onClick={() => deleteCard(card.id)} className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-50"><X size={14} /></button>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="col-span-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nombre</label><input type="text" className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-black text-slate-800 focus:ring-1 focus:ring-brand-300" value={card.name} onChange={e => { const cards = data.domainCards.map(c => c.id === card.id ? { ...c, name: e.target.value } : c); updateField('domainCards', cards); }} placeholder="Nombre de la carta..." /></div>
                    <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nivel</label><input type="number" min={1} max={5} className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-black text-brand-600 focus:ring-1 focus:ring-brand-300 text-center" value={card.level} onChange={e => { const cards = data.domainCards.map(c => c.id === card.id ? { ...c, level: parseInt(e.target.value) || 1 } : c); updateField('domainCards', cards); }} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Dominio</label><input type="text" className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-1 focus:ring-brand-300" value={card.domain} onChange={e => { const cards = data.domainCards.map(c => c.id === card.id ? { ...c, domain: e.target.value } : c); updateField('domainCards', cards); }} placeholder="Hueso, Gracia, Cuchilla..." /></div>
                    <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tipo</label>
                      <select className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-1 focus:ring-brand-300" value={card.type} onChange={e => { const cards = data.domainCards.map(c => c.id === card.id ? { ...c, type: e.target.value } : c); updateField('domainCards', cards); }}>
                        <option>Habilidad</option><option>Hechizo</option><option>Grimorio</option>
                      </select>
                    </div>
                  </div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Descripción / Mecánica</label><textarea className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm text-slate-600 focus:ring-1 focus:ring-brand-300 min-h-[60px] resize-none" value={card.description} onChange={e => { const cards = data.domainCards.map(c => c.id === card.id ? { ...c, description: e.target.value } : c); updateField('domainCards', cards); }} placeholder="Descripción de la carta y sus mecánicas..." /></div>
                </div>
              ))}
              {newCardForm && (
                <div className="p-5 bg-brand-50 rounded-2xl border-2 border-brand-200">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="col-span-2"><label className="text-[9px] font-black text-brand-600 uppercase tracking-widest block mb-1">Nombre</label><input autoFocus type="text" className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-black text-slate-800 focus:ring-1 focus:ring-brand-300" value={newCardForm.name} onChange={e => setNewCardForm({ ...newCardForm, name: e.target.value })} placeholder="Nombre de la carta..." /></div>
                    <div><label className="text-[9px] font-black text-brand-600 uppercase tracking-widest block mb-1">Nivel</label><input type="number" min={1} max={5} className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-black text-brand-600 text-center focus:ring-1 focus:ring-brand-300" value={newCardForm.level} onChange={e => setNewCardForm({ ...newCardForm, level: parseInt(e.target.value) || 1 })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div><label className="text-[9px] font-black text-brand-600 uppercase tracking-widest block mb-1">Dominio</label><input type="text" className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-1 focus:ring-brand-300" value={newCardForm.domain} onChange={e => setNewCardForm({ ...newCardForm, domain: e.target.value })} placeholder="Hueso, Gracia..." /></div>
                    <div><label className="text-[9px] font-black text-brand-600 uppercase tracking-widest block mb-1">Tipo</label>
                      <select className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-1 focus:ring-brand-300" value={newCardForm.type} onChange={e => setNewCardForm({ ...newCardForm, type: e.target.value })}>
                        <option>Habilidad</option><option>Hechizo</option><option>Grimorio</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-2"><label className="text-[9px] font-black text-brand-600 uppercase tracking-widest block mb-1">Descripción</label><textarea className="w-full bg-white border-none rounded-xl px-3 py-2 text-sm text-slate-600 focus:ring-1 focus:ring-brand-300 min-h-[80px] resize-none" value={newCardForm.description} onChange={e => setNewCardForm({ ...newCardForm, description: e.target.value })} placeholder="Mecánicas de la carta..." /></div>
                  <div className="flex gap-2">
                    <button onClick={saveCard} className="flex-1 py-2 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 transition-colors">Guardar Carta</button>
                    <button onClick={() => setNewCardForm(null)} className="py-2 px-4 bg-white text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors">Cancelar</button>
                  </div>
                </div>
              )}
              {(data.domainCards || []).length === 0 && !newCardForm && (
                <p className="text-center text-slate-400 text-sm py-4 font-medium">Sin cartas. Pulsa + para agregar una carta de dominio.</p>
              )}
            </div>
          </section>
      </>
      )}

      {sheetTab === 'details' && (
      <div className="space-y-8">
                  {/* Heritage & Community features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Feather size={14} /> Rasgos de Herencia</h3>
              <textarea className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[120px] focus:ring-2 focus:ring-brand-500 outline-none resize-none" value={data.ancestryFeatures || ''} onChange={(e) => updateField('ancestryFeatures', e.target.value)} placeholder="Rasgos y mecánicas de tu herencia (ej: Alta resistencia, Adaptabilidad...)..." />
            </section>
            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Users size={14} /> Rasgos de Comunidad</h3>
              <textarea className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[120px] focus:ring-2 focus:ring-brand-500 outline-none resize-none" value={data.communityFeatures || ''} onChange={(e) => updateField('communityFeatures', e.target.value)} placeholder="Rasgos y mecánicas de tu comunidad (ej: Highborne, Wanderborne...)..." />
            </section>
          </div>

          {/* Class features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">{React.createElement(IconMap[iconName] || Sparkles, { size: 14 })} Rasgos de Clase</h3>
              <textarea className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[150px] focus:ring-2 focus:ring-brand-500 outline-none resize-none" value={data.classFeatures || ''} onChange={(e) => updateField('classFeatures', e.target.value)} placeholder="Características y habilidades de clase (ej: Tecnología militar, Ojo para el detalle...)..." />
            </section>
            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Crown size={14} /> Rasgos de Subclase</h3>
              <textarea className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[150px] focus:ring-2 focus:ring-brand-500 outline-none resize-none" value={data.subclassFeatures || ''} onChange={(e) => updateField('subclassFeatures', e.target.value)} placeholder="Rasgos de subclase: Foundation, Especialización, Mastery..." />
            </section>
          </div>

          {/* Hope Feature */}
          <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Star size={14} /> Rasgo de Esperanza</h3>
            <textarea className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[100px] focus:ring-2 focus:ring-brand-500 outline-none resize-none" value={data.hopeFeature || ''} onChange={(e) => updateField('hopeFeature', e.target.value)} placeholder="Habilidad especial de clase que cuesta 3 puntos de Esperanza (ej: Rasgo de Hope)..." />
          </section>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Briefcase size={14} /> Inventario</h3>
              <textarea className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[150px] focus:ring-2 focus:ring-brand-500 outline-none resize-none" value={data.inventory} onChange={(e) => updateField('inventory', e.target.value)} placeholder="Equipo, armas, armadura, pociones..." />
            </section>
            <section className="glass rounded-[2rem] p-8 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Book size={14} /> Notas</h3>
              <textarea className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-600 min-h-[150px] focus:ring-2 focus:ring-brand-500 outline-none resize-none" value={data.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Historia, objetivos, secretos, conexiones..." />
            </section>
          </div>
        </div>
    )}

      <footer className="flex justify-center pt-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Sincronizado en tiempo real
        </div>
      </footer>

      {showDeleteConfirm && <Modal title="Eliminar Personaje" onClose={() => setShowDeleteConfirm(false)} onConfirm={onDelete} confirmText="Eliminar" confirmColor="bg-red-600"><p className="text-slate-600 font-medium leading-relaxed">¿Estás seguro? Esta acción no se puede deshacer.</p></Modal>}
    </div>
  );
}