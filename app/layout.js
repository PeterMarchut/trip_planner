import './globals.css';
import Nav from './components/Nav';

export const metadata = {
  title: 'Vacation Planner',
  description: 'Plan destinations, travel details, and itineraries.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
