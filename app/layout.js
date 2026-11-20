import './style.css'

export const metadata = {
  title: 'Terrapin Events | Campus events at Maryland',
  description: 'Discover, host, and register for campus events at the University of Maryland.'
}

export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>
}
