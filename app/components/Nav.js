'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOwnerToken } from '../lib/auth';

const links = [
  { href: '/', label: 'Planning' },
  { href: '/itinerary', label: 'Itinerary' },
  { href: '/transportation', label: 'Transportation' },
  { href: '/accommodations', label: 'Accommodations' },
  { href: '/events', label: 'Events' }
];

export default function Nav() {
  const pathname = usePathname();
  const { isOwner, hydrated, setToken } = useOwnerToken();

  const handleSignIn = () => {
    if (typeof window === 'undefined') return;
    const t = window.prompt('Enter the owner token to enable editing:');
    if (t && t.trim()) {
      setToken(t.trim());
      window.location.reload();
    }
  };

  const handleSignOut = () => {
    setToken(null);
    if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <nav className="trip-nav">
      <div className="trip-nav-inner">
        {links.map(link => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`trip-nav-link${active ? ' active' : ''}`}
            >
              {link.label}
            </Link>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {hydrated && (
            isOwner ? (
              <>
                <span style={{ fontSize: '0.78em', opacity: 0.7 }}>🔓 Owner</span>
                <button onClick={handleSignOut} className="trip-nav-link" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: '0.78em', opacity: 0.7 }}>👁 Read-only</span>
                <button onClick={handleSignIn} className="trip-nav-link" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  Sign in
                </button>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
