'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Planning' },
  { href: '/itinerary', label: 'Itinerary' },
  { href: '/transportation', label: 'Transportation' },
  { href: '/accommodations', label: 'Accommodations' },
  { href: '/events', label: 'Events' }
];

export default function Nav() {
  const pathname = usePathname();
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
      </div>
    </nav>
  );
}
