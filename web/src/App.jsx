import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import Group from './pages/Group.jsx';
import Groups from './pages/Groups.jsx';
import Login from './pages/Login.jsx';
import Personal from './pages/Personal.jsx';
import Planner from './pages/Planner.jsx';
import PlannerAlerts from './components/PlannerAlerts.jsx';
import Icon from './components/Icon.jsx';
import { Spinner } from './ui.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="full-loader"><Spinner label="Preparando seu espaço de estudos…" /></div>;
  return user ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [ai, setAi] = useState(null);
  useEffect(() => { api('/ai/status').then(setAi).catch(() => {}); }, []);
  const authPage = ['/login','/cadastro'].includes(location.pathname) && !user;
  if (authPage) return <div className="auth-layout">{children}</div>;
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Link to="/" className="brand-wrap"><span className="brand-symbol"><Icon name="books" size={25} /></span><span className="brand-name">study<span>rag</span><small>LEARNING SPACE</small></span></Link>
        <div className="sidebar-section-label">MENU PRINCIPAL</div>
        <nav className="sidebar-nav" aria-label="Menu principal">
          <Link to="/" className={`sidebar-link ${location.pathname === '/' ? 'selected' : ''}`}><Icon name="home" /> Visão geral</Link>
          <Link to="/" className={`sidebar-link ${location.pathname.startsWith('/grupos/') ? 'selected' : ''}`}><Icon name="folder" /> Meus grupos</Link>
          <Link to="/individual" className={`sidebar-link ${location.pathname==='/individual'?'selected':''}`}><Icon name="books"/> Estudo individual</Link>
          <Link to="/planner" className={`sidebar-link ${location.pathname==='/planner'?'selected':''}`}><Icon name="calendar"/> Planner IA</Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><div className="sidebar-tip-icon"><Icon name="spark" size={19}/></div><strong>Estude com inteligência</strong><p>Seus PDFs se transformam em explicações, simulados e muito mais.</p></div>
        <div className="sidebar-profile"><span className="avatar">{user?.name?.slice(0, 1).toUpperCase() || 'A'}</span><div><strong>{user?.name || 'Estudante'}</strong><small>Minha conta</small></div><button onClick={logout} className="icon-button sidebar-logout" title="Sair da conta" aria-label="Sair da conta"><Icon name="logout" size={18}/></button></div>
      </aside>
      <div className="app-main">
        <header className="topbar"><div className="topbar-heading"><span className="breadcrumb">Espaço de estudos</span><span className="breadcrumb-sep">/</span><span>{location.pathname === '/' ? 'Visão geral' : location.pathname === '/individual' ? 'Estudo individual' : location.pathname === '/planner' ? 'Planner IA' : 'Meu grupo'}</span></div><div className="topbar-right"><span className={`ai-pill ${ai?.isMock ? 'mock' : 'live'}`}><span className="pill-dot"/>{ai ? ai.isMock ? 'IA demonstração' : 'Gemini conectado' : 'Conectando IA'}</span><span className="topbar-avatar">{user?.name?.charAt(0).toUpperCase()}</span></div></header>
        {ai?.isMock && <div className="banner"><Icon name="spark" size={16}/> A inteligência artificial está em modo demonstração. Configure o Gemini no arquivo <code>.env</code> para usar respostas reais.</div>}
        <main className="content">{children}</main>
        <PlannerAlerts/>
        <footer className="site-footer"><span>© 2026 StudyRAG</span><span>Aprender pode ser mais simples. ✦</span></footer>
      </div>
    </div>
  );
}

export default function App() {
  return <Layout><Routes>
    <Route path="/login" element={<Login mode="login"/>}/>
    <Route path="/cadastro" element={<Login mode="register"/>}/>
    <Route path="/" element={<Protected><Groups/></Protected>}/>
    <Route path="/grupos/:groupId" element={<Protected><Group/></Protected>}/>
    <Route path="/individual" element={<Protected><Personal/></Protected>}/>
    <Route path="/planner" element={<Protected><Planner/></Protected>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Layout>;
}
